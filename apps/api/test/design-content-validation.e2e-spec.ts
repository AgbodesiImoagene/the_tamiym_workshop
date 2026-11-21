import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthSurface,
  MediaAssetStatus,
  MediaSourceType,
  MediaVisibility,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const PASSWORD = 'TestPassword1!';
// Outside production the API address defaults to the one the app uses locally.
const API = 'http://localhost:3001/v1';

/**
 * TTW-100: the server validates the content of a saved design. The bypass of the client
 * review (row 3.7) was an external image or another user's image in `designData`.
 */
describe('Design content validation (e2e, TTW-100)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let productId: string;
  let counter = 0;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
    const category = await prisma.category.create({
      data: { name: `Content Cat ${stamp}`, slug: `content-cat-${stamp}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Content Tee ${stamp}`,
        slug: `content-tee-${stamp}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createUser() {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        email: `design-content-${stamp}-${counter}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Design',
        lastName: 'Content',
        emailVerifiedAt: new Date(),
      },
    });
    const session = await authService.login(
      { email: user.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    return { user, token: session.access_token };
  }

  async function createAsset(
    ownerUserId: string,
    status: MediaAssetStatus = MediaAssetStatus.READY,
  ) {
    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        sourceType: MediaSourceType.UPLOAD,
        visibility: MediaVisibility.PRIVATE,
        status,
      },
    });
    return prisma.designAsset.create({
      data: { ownerUserId, mediaAssetId: mediaAsset.id },
    });
  }

  const imageLayer = (assetId: string, src?: string) => ({
    type: 'Image',
    src: src ?? `${API}/design-assets/${assetId}/file?variant=original`,
    crossOrigin: 'use-credentials',
    filters: [],
    data: { designAssetId: assetId, layerId: `layer-${assetId}` },
  });
  const textLayer = { type: 'IText', text: 'Community Day', fontSize: 40 };
  const designData = (objects: unknown[]) => ({
    version: 1,
    productId,
    views: {
      front: {
        productViewId: 'pv-1',
        isUsed: true,
        layerCount: objects.length,
        fabricJson: { objects },
      },
    },
  });

  const post = (token: string, data: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/v1/designs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Content design', productId, designData: data });

  const countDesigns = (userId: string) =>
    prisma.design.count({ where: { userId } });

  it('saves a design made of text and the owner’s READY images', async () => {
    const { user, token } = await createUser();
    const asset = await createAsset(user.id);

    await post(token, designData([textLayer, imageLayer(asset.id)])).expect(
      201,
    );

    expect(await countDesigns(user.id)).toBe(1);
  });

  it('still saves an empty design, as the editor does before the first layer', async () => {
    const { user, token } = await createUser();
    await post(token, { version: 1, productId, views: {} }).expect(201);
    expect(await countDesigns(user.id)).toBe(1);
  });

  it('refuses an external image on create, with a stable code, and saves nothing', async () => {
    const { user, token } = await createUser();
    const asset = await createAsset(user.id);

    const res = await post(
      token,
      designData([
        imageLayer(asset.id, 'https://evil.example.com/tracking-pixel.png'),
      ]),
    ).expect(400);

    expect(res.body).toMatchObject({ code: 'DESIGN_IMAGE_EXTERNAL' });
    expect(await countDesigns(user.id)).toBe(0);
  });

  it('refuses the image of another user, the same way as an unknown one', async () => {
    const { user, token } = await createUser();
    const stranger = await createUser();
    const foreignAsset = await createAsset(stranger.user.id);

    const foreign = await post(
      token,
      designData([imageLayer(foreignAsset.id)]),
    ).expect(400);
    const unknown = await post(
      token,
      designData([imageLayer('does-not-exist')]),
    ).expect(400);

    expect(foreign.body).toMatchObject({ code: 'DESIGN_ASSET_NOT_FOUND' });
    expect(unknown.body).toEqual(foreign.body);
    expect(await countDesigns(user.id)).toBe(0);
  });

  it('refuses an image that is not READY yet', async () => {
    const { user, token } = await createUser();
    const pending = await createAsset(user.id, MediaAssetStatus.PENDING);

    const res = await post(token, designData([imageLayer(pending.id)])).expect(
      400,
    );

    expect(res.body).toMatchObject({ code: 'DESIGN_ASSET_NOT_READY' });
  });

  it('refuses an unknown object type and an unknown field', async () => {
    const { token } = await createUser();

    const type = await post(
      token,
      designData([{ type: 'rect', left: 1 }]),
    ).expect(400);
    const field = await post(
      token,
      designData([{ ...textLayer, onclick: 'x' }]),
    ).expect(400);

    expect(type.body).toMatchObject({ code: 'DESIGN_OBJECT_TYPE_NOT_ALLOWED' });
    expect(field.body).toMatchObject({ code: 'DESIGN_FIELD_NOT_ALLOWED' });
  });

  describe('update', () => {
    async function savedDesign() {
      const owner = await createUser();
      const asset = await createAsset(owner.user.id);
      const created = await post(
        owner.token,
        designData([imageLayer(asset.id)]),
      ).expect(201);
      return { ...owner, asset, id: (created.body as { id: string }).id };
    }

    const patch = (token: string, id: string, data: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch(`/v1/designs/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ designData: data });

    it('accepts a new version of the design that uses the same assets', async () => {
      const { token, id, asset } = await savedDesign();
      await patch(
        token,
        id,
        designData([textLayer, imageLayer(asset.id)]),
      ).expect(200);
    });

    it('refuses an external image and keeps the saved content', async () => {
      const { token, id, asset } = await savedDesign();
      const before = await prisma.design.findUniqueOrThrow({ where: { id } });

      const res = await patch(
        token,
        id,
        designData([imageLayer(asset.id, 'https://evil.example.com/a.png')]),
      ).expect(400);

      expect(res.body).toMatchObject({ code: 'DESIGN_IMAGE_EXTERNAL' });
      const after = await prisma.design.findUniqueOrThrow({ where: { id } });
      expect(after.designData).toEqual(before.designData);
    });

    it('refuses the image of another user', async () => {
      const { token, id } = await savedDesign();
      const stranger = await createUser();
      const foreignAsset = await createAsset(stranger.user.id);

      const res = await patch(
        token,
        id,
        designData([imageLayer(foreignAsset.id)]),
      ).expect(400);

      expect(res.body).toMatchObject({ code: 'DESIGN_ASSET_NOT_FOUND' });
    });
  });
});
