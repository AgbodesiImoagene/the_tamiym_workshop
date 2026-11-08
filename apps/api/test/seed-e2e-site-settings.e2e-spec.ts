import {
  closePrismaScriptContext,
  createPrismaScriptContext,
  type PrismaScriptContext,
} from '../scripts/_prisma-script-client';
import { seedE2eSiteSettings } from '../scripts/seed-e2e-site-settings';

/**
 * TTW-181: `seed:e2e` must store the real 7.5% VAT rate, not a value rounded
 * by a money helper. The settings row that existed before the suite is
 * restored afterwards, because other suites share the database.
 */
describe('seed:e2e site settings (e2e)', () => {
  let context: PrismaScriptContext;
  let previousRow: Awaited<ReturnType<typeof readRow>>;

  function readRow() {
    return context.prisma.siteSettings.findUnique({ where: { id: 'default' } });
  }

  beforeAll(async () => {
    context = createPrismaScriptContext();
    previousRow = await readRow();
  });

  afterAll(async () => {
    await context.prisma.siteSettings.deleteMany({ where: { id: 'default' } });
    if (previousRow) {
      await context.prisma.siteSettings.create({ data: previousRow });
    }
    await closePrismaScriptContext(context);
  });

  it('creates the default row with VAT 0.0750 and money kept to 2 decimals', async () => {
    await context.prisma.siteSettings.deleteMany({ where: { id: 'default' } });

    await seedE2eSiteSettings(context.prisma);

    const row = await readRow();
    expect(row?.vatRate.toFixed(4)).toBe('0.0750');
    expect(row?.minimumPayoutAmount?.toFixed(2)).toBe('1000.00');
  });

  it('overwrites an existing row back to VAT 0.0750 on every run', async () => {
    await context.prisma.siteSettings.update({
      where: { id: 'default' },
      data: { vatRate: '0.0000' },
    });

    await seedE2eSiteSettings(context.prisma);
    await seedE2eSiteSettings(context.prisma);

    const row = await readRow();
    expect(row?.vatRate.toFixed(4)).toBe('0.0750');
  });
});
