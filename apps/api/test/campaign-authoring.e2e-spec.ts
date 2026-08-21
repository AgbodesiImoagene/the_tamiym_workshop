import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthSurface,
  CampaignStatus,
  ModerationStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const PASSWORD = 'TestPassword1!';

/**
 * TTW-035 slice 1 — organiser campaign authoring:
 * authz, draftRevision concurrency, floor validation, atomic offer rollback.
 */
describe('Campaign authoring (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createOrganizer() {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email: `camp-auth-${stamp}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Camp',
        lastName: 'Author',
        phone: '+2348011111111',
        emailVerifiedAt: new Date(),
      },
    });
    const session = await authService.login(
      { email: user.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    return { user, accessToken: session.access_token };
  }

  async function seedProductAndDesign(ownerId: string) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const category = await prisma.category.create({
      data: {
        name: `Authoring Cat ${stamp}`,
        slug: `authoring-cat-${stamp}`,
      },
    });
    const product = await prisma.product.create({
      data: {
        name: `Authoring Tee ${stamp}`,
        slug: `authoring-tee-${stamp}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: {
          create: [{ currency: 'NGN', amount: 4000 }],
        },
        variants: {
          create: [
            {
              name: 'Default',
              sku: `AUTH-${stamp}`,
              isAvailable: true,
              prices: { create: [{ currency: 'NGN', amount: 4000 }] },
            },
          ],
        },
      },
    });
    const design = await prisma.design.create({
      data: {
        userId: ownerId,
        productId: product.id,
        name: `Design ${stamp}`,
        designData: { version: 1, productId: product.id, views: {} },
        moderationStatus: ModerationStatus.PENDING,
      },
    });
    return { product, design };
  }

  it('rejects foreign campaign mutation and enforces stale revision', async () => {
    const owner = await createOrganizer();
    const other = await createOrganizer();
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: owner.user.id,
        title: 'Owned Draft',
        slug: `owned-draft-${Date.now()}`,
        status: CampaignStatus.DRAFT,
        draftRevision: 1,
      },
    });

    await request(app.getHttpServer())
      .patch(`/v1/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ expectedRevision: 1, title: 'Hijack' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/v1/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ expectedRevision: 1, title: 'First save' })
      .expect(200);

    const stale = await request(app.getHttpServer())
      .patch(`/v1/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ expectedRevision: 1, title: 'Stale save' })
      .expect(409);

    const code =
      stale.body?.code ??
      (typeof stale.body?.message === 'object'
        ? stale.body.message?.code
        : undefined);
    expect(code).toBe('CAMPAIGN_STALE_REVISION');
  });

  it('adds offer atomically with floor check and rolls back on below-floor', async () => {
    const owner = await createOrganizer();
    const { product, design } = await seedProductAndDesign(owner.user.id);
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: owner.user.id,
        title: 'Offer Draft',
        slug: `offer-draft-${Date.now()}`,
        status: CampaignStatus.DRAFT,
        draftRevision: 1,
      },
    });

    const below = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/offers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        expectedRevision: 1,
        productId: product.id,
        designId: design.id,
        price: 1,
      });

    expect(below.status).toBe(400);
    const offerCount = await prisma.campaignProduct.count({
      where: { campaignId: campaign.id },
    });
    expect(offerCount).toBe(0);

    const ok = await request(app.getHttpServer())
      .post(`/v1/campaigns/${campaign.id}/offers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        expectedRevision: 1,
        productId: product.id,
        designId: design.id,
        price: 50_000,
      })
      .expect(201);

    expect(ok.body.draftRevision).toBe(2);
    expect(ok.body.offers?.length).toBe(1);

    const preview = await request(app.getHttpServer())
      .get(`/v1/campaigns/${campaign.id}/preview`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(preview.body.purchasable).toBe(false);
    expect(preview.body.previewWatermark).toBe('DRAFT');
  });
});
