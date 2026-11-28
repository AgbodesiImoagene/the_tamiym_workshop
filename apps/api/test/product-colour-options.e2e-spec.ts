import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { fixColourOptions } from '../src/products/fix-colour-options';
import {
  AuthSurface,
  CurrencyCode,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const PASSWORD = 'TestPassword1!';

/**
 * TTW-266: product colours are written as hex codes. Runs the production
 * AppModule against real Postgres: admin routes, DTO validation, the
 * (productId, code) unique index, the product list and the data repair.
 */
describe('Product colour options (e2e)', () => {
  const suffix = `${Date.now()}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminAuth: string;
  let adminId: string;
  let categoryId: string;
  let seq = 0;
  const productIds: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);

    const email = `colour-admin-${suffix}@example.com`;
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Colour',
        lastName: 'Admin',
      },
    });
    adminId = admin.id;
    const challenge = await authService.login(
      { email, password: PASSWORD },
      AuthSurface.ADMIN,
    );
    if (!isMfaChallengeResponse(challenge)) {
      throw new Error('expected MFA enrollment challenge');
    }
    const enrollment = await authService.adminMfaEnrollStart(
      challenge.mfa_token,
    );
    const session = await authService.adminMfaEnrollConfirm(
      challenge.mfa_token,
      generateTotpCode(enrollment.secret),
    );
    adminAuth = `Bearer ${session.access_token}`;

    const category = await prisma.category.create({
      data: { name: `Colour Cat ${suffix}`, slug: `colour-cat-${suffix}` },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.authSession.deleteMany({ where: { userId: adminId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await closeE2eApp(app);
  });

  async function makeProduct() {
    const label = `${suffix}-${++seq}`;
    const product = await prisma.product.create({
      data: {
        name: `Colour Product ${label}`,
        slug: `colour-product-${label}`,
        status: ProductStatus.ACTIVE,
        categoryId,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    productIds.push(product.id);
    return product;
  }

  const post = (url: string, body: object) =>
    request(app.getHttpServer())
      .post(url)
      .set('Authorization', adminAuth)
      .send(body);
  const patch = (url: string, body: object) =>
    request(app.getHttpServer())
      .patch(url)
      .set('Authorization', adminAuth)
      .send(body);
  const optionsUrl = (productId: string) =>
    `/v1/admin/products/${productId}/options`;
  const valuesUrl = (productId: string, optionId: string) =>
    `${optionsUrl(productId)}/${optionId}/values`;

  async function colourOption(code = 'color') {
    const product = await makeProduct();
    const res = await post(optionsUrl(product.id), {
      code,
      name: 'Color',
    }).expect(201);
    const option = res.body as { id: string; code: string };
    return { product, option, url: valuesUrl(product.id, option.id) };
  }

  const storedValues = (optionId: string) =>
    prisma.productOptionValue.findMany({ where: { optionId } });

  it('stores an option typed "colour" as "color"', async () => {
    const { option } = await colourOption('Colour');

    expect(option.code).toBe('color');
    await expect(
      prisma.productOption.findUniqueOrThrow({ where: { id: option.id } }),
    ).resolves.toMatchObject({ code: 'color' });
  });

  it('normalises "colour" on update too', async () => {
    const { product, option } = await colourOption('shade');

    await patch(`${optionsUrl(product.id)}/${option.id}`, {
      code: 'colour',
    }).expect(200);

    await expect(
      prisma.productOption.findUniqueOrThrow({ where: { id: option.id } }),
    ).resolves.toMatchObject({ code: 'color' });
  });

  it('answers 409 for a second colour option under the other spelling', async () => {
    const { product } = await colourOption('color');

    await post(optionsUrl(product.id), {
      code: 'colour',
      name: 'Colour',
    }).expect(409);

    await expect(
      prisma.productOption.count({ where: { productId: product.id } }),
    ).resolves.toBe(1);
  });

  it.each([
    ['Color', 'colour'],
    ['COLOR', 'color'],
    ['color', ' color '],
  ])(
    'answers 409 for a second colour option ("%s" then "%s")',
    async (first, second) => {
      const { product } = await colourOption(first);

      await post(optionsUrl(product.id), { code: second, name: 'Two' }).expect(
        409,
      );

      await expect(
        prisma.productOption.count({ where: { productId: product.id } }),
      ).resolves.toBe(1);
    },
  );

  it('answers 409 for a new colour option next to an old "colour" one', async () => {
    const { product } = await legacyProduct('Black');

    await post(optionsUrl(product.id), { code: 'color', name: 'Two' }).expect(
      409,
    );
  });

  it('answers 409 when another option is renamed to a second colour option', async () => {
    const { product } = await colourOption('Color');
    const other = await post(optionsUrl(product.id), {
      code: 'shade',
      name: 'Shade',
    }).expect(201);
    const otherId = (other.body as { id: string }).id;

    await patch(`${optionsUrl(product.id)}/${otherId}`, {
      code: 'colour',
    }).expect(409);
  });

  it('still saves an old option of a product that holds both spellings', async () => {
    const { product, option } = await legacyProduct('Black');
    await prisma.productOption.create({
      data: { productId: product.id, code: 'color', name: 'Color' },
    });

    // The admin screen always sends the code back, with the other fields.
    await patch(`${optionsUrl(product.id)}/${option.id}`, {
      code: 'colour',
      name: 'Old colour',
    }).expect(200);

    await expect(
      prisma.productOption.findUniqueOrThrow({ where: { id: option.id } }),
    ).resolves.toMatchObject({ code: 'colour', name: 'Old colour' });
  });

  it.each([
    ['a colour name', { hex: 'green' }],
    ['a short code', { hex: '#12' }],
    ['an empty hex', { hex: '' }],
    ['a null hex', { hex: null }],
    ['a string instead of an object', '#008000'],
    ['a list instead of an object', ['#008000']],
    ['null', null],
  ])(
    'refuses %s on a new colour value and stores nothing',
    async (_label, metadata) => {
      const { option, url } = await colourOption();

      await post(url, {
        valueCode: 'GREEN',
        displayName: 'Green',
        metadata,
      }).expect(400);

      await expect(storedValues(option.id)).resolves.toEqual([]);
    },
  );

  it('stores a valid hex, then refuses to overwrite it with an invalid one', async () => {
    const { option, url } = await colourOption();
    const created = await post(url, {
      valueCode: 'GREEN',
      displayName: 'Green',
      metadata: { hex: '#008000' },
    }).expect(201);
    const valueId = (created.body as { id: string }).id;

    await patch(`${url}/${valueId}`, { metadata: { hex: 'orange' } }).expect(
      400,
    );
    await expect(storedValues(option.id)).resolves.toEqual([
      expect.objectContaining({ metadata: { hex: '#008000' } }),
    ]);

    await patch(`${url}/${valueId}`, { metadata: { hex: '#ffa500' } }).expect(
      200,
    );
    await expect(storedValues(option.id)).resolves.toEqual([
      expect.objectContaining({ metadata: { hex: '#ffa500' } }),
    ]);
  });

  it('still accepts a colour value without a hex', async () => {
    const { option, url } = await colourOption();

    await post(url, { valueCode: 'MIX', displayName: 'Mixed' }).expect(201);

    await expect(storedValues(option.id)).resolves.toHaveLength(1);
  });

  it('leaves the metadata of other options unchecked', async () => {
    const { option, url } = await colourOption('material');

    await post(url, {
      valueCode: 'COTTON',
      displayName: 'Cotton',
      metadata: { hex: 'not-a-colour' },
    }).expect(201);

    await expect(storedValues(option.id)).resolves.toEqual([
      expect.objectContaining({ metadata: { hex: 'not-a-colour' } }),
    ]);
  });

  /** Rows written before TTW-266: British spelling, no hex. */
  async function legacyProduct(valueName: string) {
    const product = await makeProduct();
    const option = await prisma.productOption.create({
      data: { productId: product.id, code: 'colour', name: 'Colour' },
    });
    const value = await prisma.productOptionValue.create({
      data: {
        optionId: option.id,
        valueCode: valueName.toUpperCase(),
        displayName: valueName,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: valueName,
        sku: `SKU-COL-${product.slug}`,
      },
    });
    await prisma.variantOptionValue.create({
      data: {
        variantId: variant.id,
        optionId: option.id,
        optionValueId: value.id,
      },
    });
    return { product, option, value };
  }

  async function listedColours(slug: string) {
    const res = await request(app.getHttpServer())
      .get('/v1/products')
      .expect(200);
    const list = res.body as Array<{
      slug: string;
      colors: Array<{ name: string; hex: string | null }>;
    }>;
    return list.find((item) => item.slug === slug)?.colors;
  }

  it('lists the colours of an old "colour" product, then their hex once repaired', async () => {
    const { product, option, value } = await legacyProduct('Black');
    const findHex = (name: string) =>
      name.toLowerCase() === 'black' ? '#000000' : undefined;

    await expect(listedColours(product.slug)).resolves.toEqual([
      expect.objectContaining({ name: 'Black', hex: null }),
    ]);

    await fixColourOptions(
      { prisma, findHex },
      { apply: false, productIds: [product.id] },
    );
    await expect(
      prisma.productOption.findUniqueOrThrow({ where: { id: option.id } }),
    ).resolves.toMatchObject({ code: 'colour' });

    await fixColourOptions(
      { prisma, findHex },
      { apply: true, productIds: [product.id] },
    );
    await expect(
      prisma.productOption.findUniqueOrThrow({ where: { id: option.id } }),
    ).resolves.toMatchObject({ code: 'color' });
    await expect(
      prisma.productOptionValue.findUniqueOrThrow({ where: { id: value.id } }),
    ).resolves.toMatchObject({ metadata: { hex: '#000000' } });
    await expect(listedColours(product.slug)).resolves.toEqual([
      expect.objectContaining({ name: 'Black', hex: '#000000' }),
    ]);

    const second = await fixColourOptions(
      { prisma, findHex },
      { apply: true, productIds: [product.id] },
    );
    expect(second.options).toEqual([]);
  });
});
