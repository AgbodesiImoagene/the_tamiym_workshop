import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerEntryType } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';

/**
 * Campaign balance ledger: immutable entries for settlement (payments, refunds, payouts).
 * Eligible balance = sum(amount) where availableAt <= now.
 */
@Injectable()
export class CampaignLedgerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get settlement hold days from site settings (default 7).
   */
  async getSettlementHoldDays(): Promise<number> {
    const settings = await this.prisma.siteSettings.findUnique({
      where: { id: 'default' },
    });
    return settings?.payoutSettlementHoldDays ?? 7;
  }

  /**
   * Create PAYMENT_SETTLED ledger entry when a campaign order is paid.
   * availableAt = settledAt + settlementHoldDays, or use options.availableAt when inside a transaction.
   * Pass tx to run inside an existing transaction.
   */
  async createPaymentSettled(
    campaignId: string,
    orderId: string,
    amount: number,
    currency: string,
    settledAt: Date,
    options?: {
      metadata?: Record<string, unknown>;
      availableAt?: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    let availableAt: Date;
    if (options?.availableAt) {
      availableAt = options.availableAt;
    } else {
      const holdDays = await this.getSettlementHoldDays();
      availableAt = new Date(settledAt);
      availableAt.setDate(availableAt.getDate() + holdDays);
    }

    await client.campaignBalanceLedgerEntry.create({
      data: {
        campaignId,
        orderId,
        entryType: LedgerEntryType.PAYMENT_SETTLED,
        amount,
        currency: currency as 'NGN',
        availableAt,
        metadata: (options?.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  /**
   * Create REFUND_APPLIED ledger entry (negative amount) when an order is refunded.
   * availableAt = now so it reduces eligible balance immediately.
   * Pass tx to run inside an existing transaction.
   */
  async createRefundApplied(
    campaignId: string,
    orderId: string,
    refundId: string,
    amount: number,
    currency: string,
    metadata?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.campaignBalanceLedgerEntry.create({
      data: {
        campaignId,
        orderId,
        refundId,
        entryType: LedgerEntryType.REFUND_APPLIED,
        amount: -amount,
        currency: currency as 'NGN',
        availableAt: new Date(),
        metadata: (metadata ?? undefined) as object | undefined,
      },
    });
  }

  /**
   * Create PAYOUT_RESERVED (negative) when a payout is queued; reduces eligible balance.
   */
  async createPayoutReserved(
    campaignId: string,
    payoutId: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    await this.prisma.campaignBalanceLedgerEntry.create({
      data: {
        campaignId,
        payoutId,
        entryType: LedgerEntryType.PAYOUT_RESERVED,
        amount: -amount,
        currency: currency as 'NGN',
        availableAt: new Date(),
      },
    });
  }

  /**
   * Create PAYOUT_SUCCEEDED (0 amount, audit only) when transfer succeeds.
   * Balance was already reduced by PAYOUT_RESERVED.
   */
  async createPayoutSucceeded(
    campaignId: string,
    payoutId: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    await this.prisma.campaignBalanceLedgerEntry.create({
      data: {
        campaignId,
        payoutId,
        entryType: LedgerEntryType.PAYOUT_SUCCEEDED,
        amount: 0,
        currency: currency as 'NGN',
        availableAt: new Date(),
        metadata: { confirmedAmount: amount },
      },
    });
  }

  /**
   * Create MANUAL_ADJUSTMENT (negative amount) for off-ledger manual payouts. Reduces eligible balance.
   */
  async createManualAdjustment(
    campaignId: string,
    payoutId: string,
    amount: number,
    currency: string,
    metadata?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.campaignBalanceLedgerEntry.create({
      data: {
        campaignId,
        payoutId,
        entryType: LedgerEntryType.MANUAL_ADJUSTMENT,
        amount: -amount,
        currency: currency as 'NGN',
        availableAt: new Date(),
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Create PAYOUT_FAILED (positive amount) to release the reserved balance when transfer fails.
   */
  async createPayoutFailed(
    campaignId: string,
    payoutId: string,
    amount: number,
    currency: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.campaignBalanceLedgerEntry.create({
      data: {
        campaignId,
        payoutId,
        entryType: LedgerEntryType.PAYOUT_FAILED,
        amount,
        currency: currency as 'NGN',
        availableAt: new Date(),
        metadata: (metadata ?? undefined) as object | undefined,
      },
    });
  }

  /**
   * Compute eligible payout balance for a campaign: sum(amount) where availableAt <= asOf.
   */
  async getEligibleBalance(
    campaignId: string,
    asOf: Date = new Date(),
  ): Promise<number> {
    const result = await this.prisma.campaignBalanceLedgerEntry.aggregate({
      where: {
        campaignId,
        availableAt: { lte: asOf },
      },
      _sum: { amount: true },
    });
    const sum = result._sum?.amount;
    return sum != null ? Number(sum) : 0;
  }

  /**
   * Get eligible balances for multiple campaigns (parallel queries).
   */
  async getEligibleBalancesByCampaign(
    campaignIds: string[],
    asOf: Date = new Date(),
  ): Promise<Map<string, number>> {
    const entries = await Promise.all(
      campaignIds.map(
        async (id) => [id, await this.getEligibleBalance(id, asOf)] as const,
      ),
    );
    return new Map(entries);
  }

  /**
   * Return the net ledger amount attributed to a specific payout (sum of all
   * entries for that payoutId regardless of availableAt).
   *
   * A negative result means there is an unreconciled PAYOUT_RESERVED entry —
   * i.e. the process crashed before PAYOUT_FAILED was written.
   * Used by retryPayout to detect and repair stale reservations.
   */
  async getNetLedgerAmountForPayout(payoutId: string): Promise<number> {
    const result = await this.prisma.campaignBalanceLedgerEntry.aggregate({
      where: { payoutId },
      _sum: { amount: true },
    });
    return result._sum?.amount != null ? Number(result._sum.amount) : 0;
  }
}
