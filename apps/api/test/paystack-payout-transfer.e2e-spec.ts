import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaystackWebhookService } from '../src/orders/paystack-webhook.service';
import {
  CampaignStatus,
  LedgerEntryType,
  PaymentProvider,
  PayoutMode,
  PayoutRunStatus,
  PayoutStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

describe('Paystack payout transfer idempotency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let webhooks: PaystackWebhookService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    webhooks = app.get(PaystackWebhookService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function seedInitiatedPayout(suffix: string, withRun = false) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const organizer = await prisma.user.create({
      data: {
        email: `org-payout-${suffix}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
        lastName: 'Payout',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Payout ${suffix}`,
        slug: `payout-${suffix}`,
        status: CampaignStatus.ACTIVE,
        currentAmount: 10_000,
      },
    });
    // Seed eligible balance via payment settled credit.
    await prisma.campaignBalanceLedgerEntry.create({
      data: {
        campaignId: campaign.id,
        entryType: LedgerEntryType.PAYMENT_SETTLED,
        amount: 10_000,
        currency: 'NGN',
        availableAt: new Date(Date.now() - 60_000),
        orderId: null,
      },
    });

    let payoutRunId: string | undefined;
    if (withRun) {
      const run = await prisma.payoutRun.create({
        data: {
          scheduledFor: new Date(),
          cutoffAt: new Date(),
          mode: PayoutMode.MANUAL,
          status: PayoutRunStatus.APPROVED,
        },
      });
      payoutRunId = run.id;
    }

    const amount = 2_500;
    const providerRef = `trf_ttw011_${suffix}`;
    const payout = await prisma.payout.create({
      data: {
        campaignId: campaign.id,
        recipientUserId: organizer.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef,
        status: PayoutStatus.INITIATED,
        currency: 'NGN',
        amount,
        payoutRunId,
      },
    });
    await prisma.campaignBalanceLedgerEntry.create({
      data: {
        campaignId: campaign.id,
        payoutId: payout.id,
        entryType: LedgerEntryType.PAYOUT_RESERVED,
        amount: -amount,
        currency: 'NGN',
        availableAt: new Date(),
      },
    });

    return { campaign, payout, providerRef, amount, organizer };
  }

  it('releases reserve once under fifty concurrent transfer.failed events', async () => {
    const suffix = `fail-${Date.now()}`;
    const { campaign, payout, providerRef, amount } =
      await seedInitiatedPayout(suffix);

    const before = await prisma.campaignBalanceLedgerEntry.aggregate({
      where: { campaignId: campaign.id, availableAt: { lte: new Date() } },
      _sum: { amount: true },
    });

    await Promise.all(
      Array.from({ length: 50 }, () =>
        webhooks.processTransferEvent('transfer.failed', providerRef, {
          event: 'transfer.failed',
          data: { reference: providerRef },
        }),
      ),
    );

    const updated = await prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    expect(updated.status).toBe(PayoutStatus.FAILED);

    expect(
      await prisma.campaignBalanceLedgerEntry.count({
        where: {
          payoutId: payout.id,
          entryType: LedgerEntryType.PAYOUT_FAILED,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.payoutProviderEventClaim.count({
        where: { payoutId: payout.id },
      }),
    ).toBe(1);

    const after = await prisma.campaignBalanceLedgerEntry.aggregate({
      where: { campaignId: campaign.id, availableAt: { lte: new Date() } },
      _sum: { amount: true },
    });
    expect(Number(after._sum.amount)).toBe(Number(before._sum.amount) + amount);
  });

  it('ignores FAILED after SUCCEEDED and releases once on REVERSED', async () => {
    const suffix = `rev-${Date.now()}`;
    const { campaign, payout, providerRef, amount } =
      await seedInitiatedPayout(suffix);

    await webhooks.processTransferEvent('transfer.success', providerRef, {
      event: 'transfer.success',
      data: { reference: providerRef },
    });
    await webhooks.processTransferEvent('transfer.failed', providerRef, {
      event: 'transfer.failed',
      data: { reference: providerRef },
    });

    let row = await prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    expect(row.status).toBe(PayoutStatus.SUCCEEDED);
    expect(
      await prisma.campaignBalanceLedgerEntry.count({
        where: {
          payoutId: payout.id,
          entryType: LedgerEntryType.PAYOUT_FAILED,
        },
      }),
    ).toBe(0);

    const mid = await prisma.campaignBalanceLedgerEntry.aggregate({
      where: { campaignId: campaign.id, availableAt: { lte: new Date() } },
      _sum: { amount: true },
    });

    await webhooks.processTransferEvent('transfer.reversed', providerRef, {
      event: 'transfer.reversed',
      data: { reference: providerRef },
    });
    await webhooks.processTransferEvent('transfer.reversed', providerRef, {
      event: 'transfer.reversed',
      data: { reference: providerRef },
    });

    row = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
    expect(row.status).toBe(PayoutStatus.REVERSED);
    expect(
      await prisma.campaignBalanceLedgerEntry.count({
        where: {
          payoutId: payout.id,
          entryType: LedgerEntryType.PAYOUT_FAILED,
        },
      }),
    ).toBe(1);

    const after = await prisma.campaignBalanceLedgerEntry.aggregate({
      where: { campaignId: campaign.id, availableAt: { lte: new Date() } },
      _sum: { amount: true },
    });
    expect(Number(after._sum.amount)).toBe(Number(mid._sum.amount) + amount);
  });

  it('completes payout run when all payouts reach terminal status', async () => {
    const suffix = `run-${Date.now()}`;
    const { payout, providerRef } = await seedInitiatedPayout(suffix, true);

    await webhooks.processTransferEvent('transfer.success', providerRef, {
      event: 'transfer.success',
      data: { reference: providerRef },
    });

    const runId = (
      await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })
    ).payoutRunId!;
    const run = await prisma.payoutRun.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(run.status).toBe(PayoutRunStatus.COMPLETED);
  });

  it('applies reverse after concurrent success (CAS retry)', async () => {
    const suffix = `race-${Date.now()}`;
    const { payout, campaign, providerRef } = await seedInitiatedPayout(suffix);

    await Promise.all([
      webhooks.processTransferEvent('transfer.success', providerRef, {
        event: 'transfer.success',
        data: { reference: providerRef },
      }),
      webhooks.processTransferEvent('transfer.reversed', providerRef, {
        event: 'transfer.reversed',
        data: { reference: providerRef },
      }),
    ]);

    const row = await prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    expect(row.status).toBe(PayoutStatus.REVERSED);
    expect(
      await prisma.campaignBalanceLedgerEntry.count({
        where: {
          payoutId: payout.id,
          entryType: LedgerEntryType.PAYOUT_FAILED,
        },
      }),
    ).toBe(1);

    const after = await prisma.campaignBalanceLedgerEntry.aggregate({
      where: { campaignId: campaign.id, availableAt: { lte: new Date() } },
      _sum: { amount: true },
    });
    expect(Number(after._sum.amount)).toBe(10_000);
  });

  it('completes multi-payout run under concurrent sibling successes', async () => {
    const suffix = `multi-${Date.now()}`;
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const organizer = await prisma.user.create({
      data: {
        email: `org-multi-${suffix}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
        lastName: 'Multi',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Multi ${suffix}`,
        slug: `multi-${suffix}`,
        status: CampaignStatus.ACTIVE,
        currentAmount: 20_000,
      },
    });
    await prisma.campaignBalanceLedgerEntry.create({
      data: {
        campaignId: campaign.id,
        entryType: LedgerEntryType.PAYMENT_SETTLED,
        amount: 20_000,
        currency: 'NGN',
        availableAt: new Date(Date.now() - 60_000),
        orderId: null,
      },
    });
    const run = await prisma.payoutRun.create({
      data: {
        scheduledFor: new Date(),
        cutoffAt: new Date(),
        mode: PayoutMode.MANUAL,
        status: PayoutRunStatus.EXECUTING,
      },
    });
    const amount = 2_500;
    const refs = [`trf_a_${suffix}`, `trf_b_${suffix}`];
    const payouts = [];
    for (const ref of refs) {
      const payout = await prisma.payout.create({
        data: {
          campaignId: campaign.id,
          recipientUserId: organizer.id,
          provider: PaymentProvider.PAYSTACK,
          providerRef: ref,
          status: PayoutStatus.INITIATED,
          currency: 'NGN',
          amount,
          payoutRunId: run.id,
        },
      });
      await prisma.campaignBalanceLedgerEntry.create({
        data: {
          campaignId: campaign.id,
          payoutId: payout.id,
          entryType: LedgerEntryType.PAYOUT_RESERVED,
          amount: -amount,
          currency: 'NGN',
          availableAt: new Date(),
        },
      });
      payouts.push(payout);
    }

    await Promise.all(
      refs.map((ref) =>
        webhooks.processTransferEvent('transfer.success', ref, {
          event: 'transfer.success',
          data: { reference: ref },
        }),
      ),
    );

    const updatedRun = await prisma.payoutRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(updatedRun.status).toBe(PayoutRunStatus.COMPLETED);
    expect(payouts).toHaveLength(2);
  });
});
