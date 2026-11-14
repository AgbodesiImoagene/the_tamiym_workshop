import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  closePrismaScriptContext,
  createPrismaScriptContext,
  type PrismaScriptContext,
} from '../scripts/_prisma-script-client';

/**
 * TTW-210: `seed:e2e` must run again on a database that already holds stock
 * movements for its `e2e-` variants (written by earlier checkout runs).
 * Movements point at variants with `onDelete: Restrict`, so the seed has to
 * delete them before it deletes the variants.
 *
 * The real script runs as a child process (it executes on import), exactly as
 * `pnpm seed:e2e` does. It reads the same DATABASE_URL as this suite.
 */
describe('seed:e2e on a reused database (e2e)', () => {
  // Each test runs the real seed twice (ts-node start-up + ~100 inserts).
  jest.setTimeout(400_000);

  const apiRoot = join(__dirname, '..');
  const fixtureEffectKey = 'ttw-210:fixture-movement';
  const controlEffectKey = 'ttw-210:control-movement';
  const controlIds = {
    category: 'ttw210-control-category',
    product: 'ttw210-control-product',
    variant: 'ttw210-control-variant',
  };
  const checkoutOrderNumber = 'ttw210-checkout-order-ref';
  let context: PrismaScriptContext;
  let previousSettings: Awaited<ReturnType<typeof readSettings>>;

  function readSettings() {
    return context.prisma.siteSettings.findUnique({ where: { id: 'default' } });
  }

  function runSeed() {
    execFileSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        'scripts/seed-e2e-dummy-data.ts',
      ],
      { cwd: apiRoot, env: process.env, stdio: 'pipe', timeout: 150_000 },
    );
  }

  async function addMovement(variantId: string, effectKey: string) {
    await context.prisma.inventoryMovement.create({
      data: { kind: 'RESERVE', effectKey, variantId, quantity: 1 },
    });
  }

  async function removeControlRows() {
    const { prisma } = context;
    await prisma.order.deleteMany({
      where: { paymentReference: checkoutOrderNumber },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { effectKey: { in: [fixtureEffectKey, controlEffectKey] } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: controlIds.variant },
    });
    await prisma.product.deleteMany({ where: { id: controlIds.product } });
    await prisma.category.deleteMany({ where: { id: controlIds.category } });
  }

  beforeAll(async () => {
    context = createPrismaScriptContext();
    previousSettings = await readSettings();
    await removeControlRows();
  });

  afterAll(async () => {
    await removeControlRows();
    // The seed rewrites the default settings row; other suites share it.
    await context.prisma.siteSettings.deleteMany({ where: { id: 'default' } });
    if (previousSettings) {
      await context.prisma.siteSettings.create({ data: previousSettings });
    }
    await closePrismaScriptContext(context);
  });

  it('clears movements on fixture variants and leaves other movements alone', async () => {
    const { prisma } = context;
    runSeed();

    const fixtureVariant = await prisma.productVariant.findFirstOrThrow({
      where: { id: { startsWith: 'e2e-' } },
    });
    await prisma.category.create({
      data: {
        id: controlIds.category,
        name: 'TTW-210 control',
        slug: 'ttw210-control',
      },
    });
    await prisma.product.create({
      data: {
        id: controlIds.product,
        categoryId: controlIds.category,
        name: 'TTW-210 control',
        slug: 'ttw210-control',
      },
    });
    await prisma.productVariant.create({
      data: {
        id: controlIds.variant,
        productId: controlIds.product,
        name: 'TTW-210 control',
        sku: 'TTW210-CONTROL',
      },
    });
    await addMovement(fixtureVariant.id, fixtureEffectKey);
    await addMovement(controlIds.variant, controlEffectKey);

    // Second run on the same database: must not fail on the movement.
    runSeed();

    expect(
      await prisma.inventoryMovement.count({
        where: { effectKey: fixtureEffectKey },
      }),
    ).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: { effectKey: controlEffectKey },
      }),
    ).toBe(1);
    expect(
      await prisma.productVariant.count({ where: { id: controlIds.variant } }),
    ).toBe(1);
  });

  it('clears orders a real checkout left on fixture variants (ids are not e2e-)', async () => {
    const { prisma } = context;
    runSeed();

    const fixtureVariant = await prisma.productVariant.findFirstOrThrow({
      where: { id: { startsWith: 'e2e-' } },
    });
    const order = await prisma.order.create({
      data: {
        userId: 'e2e-user-customer',
        shippingAddressId: 'e2e-address-customer-main',
        subtotalAmount: '1000.00',
        totalAmount: '1000.00',
        shipLine1: '1 Test Street',
        shipCity: 'Ikeja',
        shipState: 'Lagos',
        paymentReference: checkoutOrderNumber,
        items: {
          create: {
            productId: fixtureVariant.productId,
            variantId: fixtureVariant.id,
            quantity: 1,
            unitBasePrice: '1000.00',
            unitFinalPrice: '1000.00',
            productNameSnapshot: 'ttw-210',
            variantDisplaySnapshot: 'ttw-210',
            snapshotSource: 'PURCHASE',
          },
        },
      },
    });
    await addMovement(fixtureVariant.id, fixtureEffectKey);

    // Second run on the same database: neither the order nor its movement may block it.
    runSeed();

    expect(await prisma.order.count({ where: { id: order.id } })).toBe(0);
    expect(
      await prisma.productVariant.count({ where: { id: fixtureVariant.id } }),
    ).toBe(1);
  });
});
