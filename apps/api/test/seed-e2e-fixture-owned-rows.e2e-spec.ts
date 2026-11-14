import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  closePrismaScriptContext,
  createPrismaScriptContext,
  type PrismaScriptContext,
} from '../scripts/_prisma-script-client';

/**
 * TTW-212: rows with a generated id that point at an `e2e-` user or product
 * (campaign, payout, organiser application, privacy request, campaign
 * product, design) have Restrict foreign keys, so `seed:e2e` must delete
 * them before it deletes the fixture user or product. Same rows tied to a
 * non-fixture user must survive.
 *
 * The real script runs as a child process (it executes on import).
 */
describe('seed:e2e rows tied to fixture users and products (e2e)', () => {
  jest.setTimeout(400_000);

  const apiRoot = join(__dirname, '..');
  const marker = 'ttw212';
  const control = {
    user: `${marker}-control-user`,
    campaign: `${marker}-control-campaign`,
    payoutRef: `${marker}-control-payout`,
  };
  const fixtureCampaignSlug = `${marker}-fixture-campaign`;
  const fixturePayoutRef = `${marker}-fixture-payout`;
  const designName = `${marker}-design`;
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

  async function removeTestRows() {
    const { prisma } = context;
    await prisma.design.deleteMany({ where: { name: designName } });
    await prisma.campaignProduct.deleteMany({
      where: { campaign: { slug: { startsWith: marker } } },
    });
    // Payouts go with their campaign (cascade).
    await prisma.campaign.deleteMany({
      where: { slug: { startsWith: marker } },
    });
    await prisma.organizerApplication.deleteMany({
      where: { policyVersion: marker },
    });
    await prisma.privacyRequest.deleteMany({
      where: { policyVersion: marker },
    });
    await prisma.user.deleteMany({ where: { id: control.user } });
  }

  beforeAll(async () => {
    context = createPrismaScriptContext();
    previousSettings = await readSettings();
    await removeTestRows();
  });

  afterAll(async () => {
    await removeTestRows();
    // The seed rewrites the default settings row; other suites share it.
    await context.prisma.siteSettings.deleteMany({ where: { id: 'default' } });
    if (previousSettings) {
      await context.prisma.siteSettings.create({ data: previousSettings });
    }
    await closePrismaScriptContext(context);
  });

  it('deletes them with the fixture user or product and keeps the controls', async () => {
    const { prisma } = context;
    runSeed();

    const fixtureProduct = await prisma.product.findFirstOrThrow({
      where: { id: { startsWith: 'e2e-' } },
    });
    await prisma.user.create({
      data: {
        id: control.user,
        email: `${marker}-control@example.test`,
        firstName: 'Control',
        lastName: 'User',
      },
    });
    const controlCampaign = await prisma.campaign.create({
      data: {
        id: control.campaign,
        organizerId: control.user,
        title: 'TTW-212 control',
        slug: control.campaign,
      },
    });
    await prisma.campaign.create({
      data: {
        organizerId: 'e2e-user-organizer',
        title: 'TTW-212 fixture organiser',
        slug: fixtureCampaignSlug,
      },
    });
    await prisma.payout.create({
      data: {
        campaignId: controlCampaign.id,
        recipientUserId: control.user,
        providerRef: control.payoutRef,
        amount: '1.00',
      },
    });
    await prisma.payout.create({
      data: {
        campaignId: controlCampaign.id,
        recipientUserId: 'e2e-user-customer',
        providerRef: fixturePayoutRef,
        amount: '1.00',
      },
    });
    await prisma.organizerApplication.create({
      data: {
        userId: 'e2e-user-customer',
        organisationName: 'TTW-212',
        intendedUse: 'TTW-212',
        termsVersion: marker,
        termsAcceptedAt: new Date(),
        policyVersion: marker,
      },
    });
    await prisma.privacyRequest.create({
      data: {
        userId: 'e2e-user-customer',
        type: 'EXPORT',
        policyVersion: marker,
      },
    });
    await prisma.campaignProduct.create({
      data: { campaignId: controlCampaign.id, productId: fixtureProduct.id },
    });
    await prisma.design.create({
      data: {
        userId: control.user,
        productId: fixtureProduct.id,
        name: designName,
        designData: {},
      },
    });

    // Second run on the same database: none of these rows may block it.
    runSeed();

    const count = {
      fixtureCampaign: await prisma.campaign.count({
        where: { slug: fixtureCampaignSlug },
      }),
      fixturePayout: await prisma.payout.count({
        where: { providerRef: fixturePayoutRef },
      }),
      application: await prisma.organizerApplication.count({
        where: { policyVersion: marker },
      }),
      privacy: await prisma.privacyRequest.count({
        where: { policyVersion: marker },
      }),
      campaignProduct: await prisma.campaignProduct.count({
        where: { campaignId: controlCampaign.id },
      }),
      design: await prisma.design.count({ where: { name: designName } }),
      controlCampaign: await prisma.campaign.count({
        where: { id: control.campaign },
      }),
      controlPayout: await prisma.payout.count({
        where: { providerRef: control.payoutRef },
      }),
      controlUser: await prisma.user.count({ where: { id: control.user } }),
    };
    expect(count).toEqual({
      fixtureCampaign: 0,
      fixturePayout: 0,
      application: 0,
      privacy: 0,
      campaignProduct: 0,
      design: 0,
      controlCampaign: 1,
      controlPayout: 1,
      controlUser: 1,
    });
  });
});
