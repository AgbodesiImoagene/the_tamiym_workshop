import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { RefundsService } from '../src/orders/refunds.service';
import { PaystackRefundClient } from '../src/orders/paystack-refund.client';
import { RefundReasonCode } from '../src/orders/resolution-policy';
import { Prisma } from '../src/generated/prisma/client';
import {
  AuditOutcome,
  CampaignStatus,
  LedgerEntryType,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  RefundStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

let seq = 0;

/** Unique across runs: the e2e database is never emptied (see TTW-079). */
function uniqueId(): string {
  seq += 1;
  return String(Date.now() * 1000 + seq);
}

const CONFLICT_EVENT = 'refund.provider_ref_conflict';

/**
 * TTW-081: one local Refund per Paystack refund id, enforced by Postgres. A
 * provider id already owned by another refund never settles anything and
 * leaves the newcomer in NEEDS_ATTENTION.
 */
describe('Refund provider id uniqueness (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let refunds: RefundsService;
  let paystackRefundClient: PaystackRefundClient;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    refunds = app.get(RefundsService);
    paystackRefundClient = app.get(PaystackRefundClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createPaidCampaignOrder(totalAmount = 10_000) {
    const suffix = uniqueId();
    const passwordHash = await bcrypt.hash('TestPassword1!', 4);
    const organizer = await prisma.user.create({
      data: {
        email: `org-ttw081-${suffix}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
        lastName: 'Unique',
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `cust-ttw081-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Cust',
        lastName: 'Unique',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `TTW-081 ${suffix}`,
        slug: `ttw081-${suffix}`,
        status: CampaignStatus.ACTIVE,
        currentAmount: totalAmount,
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Test Street',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        shippingAddressId: address.id,
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.SUCCEEDED,
        currency: 'NGN',
        subtotalAmount: totalAmount,
        totalAmount,
        shipLine1: address.addressLine1,
        shipCity: address.city,
        shipState: address.state,
        shipCountry: 'Nigeria',
        campaignId: campaign.id,
      },
    });
    const txnRef = `psk_ttw081_${suffix}`;
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef: txnRef,
        status: PaymentStatus.SUCCEEDED,
        currency: 'NGN',
        amount: totalAmount,
        idempotencyKey: txnRef,
      },
    });
    return { order, campaign, payment, txnRef, totalAmount };
  }

  function mockProviderReturns(
    providerRefundId: string,
    txnRef: string,
    amountMajor: number,
    providerStatus: 'pending' | 'processed' = 'pending',
  ) {
    return jest
      .spyOn(paystackRefundClient, 'createRefund')
      .mockImplementation(async (input) => {
        await Promise.resolve();
        return {
          providerRefundId,
          providerStatus,
          refundReference: null,
          transactionReference: input.transactionReference ?? txnRef,
          amountKobo: Math.round(amountMajor * 100),
          currency: 'NGN',
        };
      });
  }

  async function ledgerRowsFor(refundId: string) {
    return prisma.campaignBalanceLedgerEntry.count({
      where: { refundId, entryType: LedgerEntryType.REFUND_APPLIED },
    });
  }

  async function settleViaProvider(totalAmount = 10_000) {
    const ctx = await createPaidCampaignOrder(totalAmount);
    const providerRefundId = uniqueId();
    mockProviderReturns(providerRefundId, ctx.txnRef, totalAmount);
    const refund = await refunds.initiateRefund(
      ctx.order.id,
      totalAmount,
      RefundReasonCode.ADMIN_GOODWILL,
      'owner refund',
    );
    await refunds.applyRefundWebhookEvent({
      event: 'refund.processed',
      data: {
        id: Number(providerRefundId),
        status: 'processed',
        amount: Math.round(totalAmount * 100),
        currency: 'NGN',
        transaction_reference: ctx.txnRef,
      },
    });
    jest.restoreAllMocks();
    const settled = await prisma.refund.findUniqueOrThrow({
      where: { id: refund.id },
    });
    expect(settled.status).toBe(RefundStatus.SUCCEEDED);
    expect(settled.providerRef).toBe(providerRefundId);
    return { ...ctx, refund: settled, providerRefundId };
  }

  async function expectConflictAudit(refundId: string, providerRef: string) {
    const entries = await prisma.auditLog.findMany({
      where: {
        entityType: 'Refund',
        entityId: refundId,
        eventName: CONFLICT_EVENT,
      },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe(AuditOutcome.FAILURE);
    expect(entries[0].after).toMatchObject({
      status: RefundStatus.NEEDS_ATTENTION,
      conflictingProviderRef: providerRef,
    });
  }

  describe('database constraint', () => {
    it('rejects a second refund with the same (provider, providerRef)', async () => {
      const a = await createPaidCampaignOrder();
      const b = await createPaidCampaignOrder();
      const providerRef = uniqueId();

      await prisma.refund.create({
        data: {
          orderId: a.order.id,
          paymentId: a.payment.id,
          provider: PaymentProvider.PAYSTACK,
          providerRef,
          status: RefundStatus.PROCESSING,
          amount: 1000,
        },
      });

      const second = prisma.refund.create({
        data: {
          orderId: b.order.id,
          paymentId: b.payment.id,
          provider: PaymentProvider.PAYSTACK,
          providerRef,
          status: RefundStatus.PROCESSING,
          amount: 1000,
        },
      });
      await expect(second).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
      await expect(second).rejects.toMatchObject({ code: 'P2002' });
      expect(
        await prisma.refund.count({
          where: { provider: PaymentProvider.PAYSTACK, providerRef },
        }),
      ).toBe(1);
    });

    it('still allows several refunds without a provider id', async () => {
      const a = await createPaidCampaignOrder();
      const rows = await Promise.all(
        [1, 2].map(() =>
          prisma.refund.create({
            data: {
              orderId: a.order.id,
              provider: PaymentProvider.PAYSTACK,
              providerRef: null,
              status: RefundStatus.INITIATED,
              amount: 1000,
            },
          }),
        ),
      );
      expect(rows).toHaveLength(2);
    });
  });

  describe('initiation receives a provider id owned by another refund', () => {
    it('leaves the new refund in NEEDS_ATTENTION and never settles, even when Paystack says processed', async () => {
      const owner = await settleViaProvider();
      const ownerLedgerBefore = await ledgerRowsFor(owner.refund.id);
      const other = await createPaidCampaignOrder();

      mockProviderReturns(
        owner.providerRefundId,
        other.txnRef,
        other.totalAmount,
        'processed',
      );
      const result = await refunds.initiateRefund(
        other.order.id,
        other.totalAmount,
        RefundReasonCode.ADMIN_GOODWILL,
        'reused provider id',
      );

      expect(result.status).toBe(RefundStatus.NEEDS_ATTENTION);
      const newcomer = await prisma.refund.findUniqueOrThrow({
        where: { id: result.id },
        include: { settlementClaim: true },
      });
      expect(newcomer.status).toBe(RefundStatus.NEEDS_ATTENTION);
      expect(newcomer.providerRef).toBeNull();
      expect(newcomer.settlementClaim).toBeNull();
      expect(await ledgerRowsFor(newcomer.id)).toBe(0);

      const otherOrder = await prisma.order.findUniqueOrThrow({
        where: { id: other.order.id },
      });
      expect(otherOrder.status).toBe(OrderStatus.PAID);
      const otherCampaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: other.campaign.id },
      });
      expect(Number(otherCampaign.currentAmount)).toBe(other.totalAmount);

      const ownerAfter = await prisma.refund.findUniqueOrThrow({
        where: { id: owner.refund.id },
      });
      expect(ownerAfter).toEqual(owner.refund);
      expect(await ledgerRowsFor(owner.refund.id)).toBe(ownerLedgerBefore);

      await expectConflictAudit(newcomer.id, owner.providerRefundId);
    });

    it('stays in NEEDS_ATTENTION when the same idempotency key retries into the same conflict', async () => {
      const owner = await settleViaProvider();
      const ownerLedgerBefore = await ledgerRowsFor(owner.refund.id);
      const other = await createPaidCampaignOrder();
      const idempotencyKey = `ttw081-retry-${uniqueId()}`;
      const providerCall = mockProviderReturns(
        owner.providerRefundId,
        other.txnRef,
        other.totalAmount,
      );

      const first = await refunds.initiateRefund(
        other.order.id,
        other.totalAmount,
        RefundReasonCode.ADMIN_GOODWILL,
        'retry',
        undefined,
        idempotencyKey,
      );
      const retry = await refunds.initiateRefund(
        other.order.id,
        other.totalAmount,
        RefundReasonCode.ADMIN_GOODWILL,
        'retry',
        undefined,
        idempotencyKey,
      );

      expect(retry.id).toBe(first.id);
      expect(retry.status).toBe(RefundStatus.NEEDS_ATTENTION);
      expect(retry.providerRef).toBeNull();
      expect(providerCall).toHaveBeenCalledTimes(2);
      expect(
        providerCall.mock.calls.map(([input]) => input.idempotencyKey),
      ).toEqual([idempotencyKey, idempotencyKey]);
      expect(
        await prisma.refund.count({ where: { orderId: other.order.id } }),
      ).toBe(1);
      expect(
        await prisma.refundSettlementClaim.count({
          where: { refundId: first.id },
        }),
      ).toBe(0);
      expect(await ledgerRowsFor(first.id)).toBe(0);
      expect(
        (
          await prisma.order.findUniqueOrThrow({
            where: { id: other.order.id },
          })
        ).status,
      ).toBe(OrderStatus.PAID);

      const ownerAfter = await prisma.refund.findUniqueOrThrow({
        where: { id: owner.refund.id },
      });
      expect(ownerAfter).toEqual(owner.refund);
      expect(await ledgerRowsFor(owner.refund.id)).toBe(ownerLedgerBefore);

      // One audit entry per conflicting attempt.
      const audits = await prisma.auditLog.findMany({
        where: {
          entityType: 'Refund',
          entityId: first.id,
          eventName: CONFLICT_EVENT,
        },
      });
      expect(audits).toHaveLength(2);
    });

    it('lets exactly one of two concurrent initiations keep the id, then settles only that one', async () => {
      const a = await createPaidCampaignOrder();
      const b = await createPaidCampaignOrder();
      const providerRefundId = uniqueId();
      mockProviderReturns(providerRefundId, a.txnRef, a.totalAmount);

      const results = await Promise.all(
        [a, b].map((ctx) =>
          refunds.initiateRefund(
            ctx.order.id,
            ctx.totalAmount,
            RefundReasonCode.ADMIN_GOODWILL,
            'concurrent',
          ),
        ),
      );

      const rows = await prisma.refund.findMany({
        where: { id: { in: results.map((r) => r.id) } },
      });
      const owners = rows.filter((r) => r.providerRef === providerRefundId);
      const flagged = rows.filter(
        (r) => r.status === RefundStatus.NEEDS_ATTENTION,
      );
      expect(owners).toHaveLength(1);
      expect(owners[0].status).toBe(RefundStatus.PROCESSING);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].providerRef).toBeNull();
      await expectConflictAudit(flagged[0].id, providerRefundId);

      // Sequential then concurrent duplicate webhooks settle the owner once.
      const owner = owners[0];
      const ownerCtx = owner.orderId === a.order.id ? a : b;
      const payload = {
        event: 'refund.processed' as const,
        data: {
          id: Number(providerRefundId),
          status: 'processed',
          amount: Math.round(ownerCtx.totalAmount * 100),
          currency: 'NGN',
          transaction_reference: ownerCtx.txnRef,
        },
      };
      await refunds.applyRefundWebhookEvent(payload);
      await refunds.applyRefundWebhookEvent(payload);
      await Promise.all(
        Array.from({ length: 10 }, () =>
          refunds.applyRefundWebhookEvent(payload),
        ),
      );

      expect(
        await prisma.refundSettlementClaim.count({
          where: { refundId: owner.id },
        }),
      ).toBe(1);
      expect(await ledgerRowsFor(owner.id)).toBe(1);
      expect(
        await prisma.refundSettlementClaim.count({
          where: { refundId: flagged[0].id },
        }),
      ).toBe(0);
      expect(await ledgerRowsFor(flagged[0].id)).toBe(0);
      const flaggedAfter = await prisma.refund.findUniqueOrThrow({
        where: { id: flagged[0].id },
      });
      expect(flaggedAfter.status).toBe(RefundStatus.NEEDS_ATTENTION);
    });
  });

  /**
   * A webhook writes the provider id onto a refund matched by transaction
   * reference only when no refund owned that id at lookup time. These tests
   * open that race window: the id lookup misses once, as if another refund
   * took the id right after it.
   */
  describe('webhook write races another owner of the provider id', () => {
    async function seedRace() {
      const ownerCtx = await createPaidCampaignOrder();
      const providerRef = uniqueId();
      const owner = await prisma.refund.create({
        data: {
          orderId: ownerCtx.order.id,
          paymentId: ownerCtx.payment.id,
          provider: PaymentProvider.PAYSTACK,
          providerRef,
          transactionReference: ownerCtx.txnRef,
          status: RefundStatus.PROCESSING,
          amount: 2500,
        },
      });
      const otherCtx = await createPaidCampaignOrder();
      const other = await prisma.refund.create({
        data: {
          orderId: otherCtx.order.id,
          paymentId: otherCtx.payment.id,
          provider: PaymentProvider.PAYSTACK,
          providerRef: null,
          transactionReference: otherCtx.txnRef,
          status: RefundStatus.PROCESSING,
          amount: 2500,
        },
      });
      const realFindFirst = prisma.refund.findFirst.bind(prisma.refund);
      let missed = false;
      jest.spyOn(prisma.refund, 'findFirst').mockImplementation(((
        args: Prisma.RefundFindFirstArgs,
      ) => {
        if (!missed && args?.where?.providerRef === providerRef) {
          missed = true;
          return Promise.resolve(null);
        }
        return realFindFirst(args);
      }) as unknown as typeof prisma.refund.findFirst);
      return { owner, other, otherCtx, providerRef };
    }

    it.each([
      'refund.processed',
      'refund.processing',
      'refund.failed',
    ] as const)(
      '%s moves the matched refund to NEEDS_ATTENTION without settling or touching the owner',
      async (event) => {
        const { owner, other, otherCtx, providerRef } = await seedRace();

        const ok = await refunds.applyRefundWebhookEvent({
          event,
          data: {
            id: Number(providerRef),
            status: event.replace('refund.', ''),
            amount: 250_000,
            currency: 'NGN',
            transaction_reference: otherCtx.txnRef,
          },
        });
        expect(ok).toBe(true);

        const otherAfter = await prisma.refund.findUniqueOrThrow({
          where: { id: other.id },
          include: { settlementClaim: true },
        });
        expect(otherAfter.status).toBe(RefundStatus.NEEDS_ATTENTION);
        expect(otherAfter.providerRef).toBeNull();
        expect(otherAfter.settlementClaim).toBeNull();
        expect(await ledgerRowsFor(other.id)).toBe(0);
        const otherOrder = await prisma.order.findUniqueOrThrow({
          where: { id: otherCtx.order.id },
        });
        expect(otherOrder.status).toBe(OrderStatus.PAID);

        const ownerAfter = await prisma.refund.findUniqueOrThrow({
          where: { id: owner.id },
        });
        expect(ownerAfter).toEqual(owner);
        await expectConflictAudit(other.id, providerRef);
      },
    );
  });
});
