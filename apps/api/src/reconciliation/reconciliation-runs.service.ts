import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  InventoryMovementKind,
  LedgerEntryType,
  OrderStatus,
  PaymentStatus,
  PayoutStatus,
  ReconciliationDomain,
  ReconciliationOutcome,
  ReconciliationRunKind,
  ReconciliationRunStatus,
  ReconciliationSeverity,
  RefundStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  FindingDraft,
  fingerprintFinding,
  lagosDayIso,
  windowKeyFor,
} from './reconciliation.util';

@Injectable()
export class ReconciliationRunsService {
  private readonly logger = new Logger(ReconciliationRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: ObservabilityService,
  ) {}

  async runInternal(cutoffAt = new Date()) {
    return this.observability.startSpan(
      'reconciliation.internal',
      { cutoff: cutoffAt.toISOString() },
      async () => {
        const day = lagosDayIso(cutoffAt);
        const windowKey = windowKeyFor('internal', day);
        const locked = await this.tryAdvisoryLock(`recon:${windowKey}`);
        if (!locked) {
          this.logger.warn(
            `Skipping internal recon; lock held for ${windowKey}`,
          );
          return null;
        }
        try {
          return await this.executeRun({
            kind: ReconciliationRunKind.INTERNAL,
            windowKey,
            cutoffAt,
            providerComplete: true,
          });
        } finally {
          await this.releaseAdvisoryLock(`recon:${windowKey}`);
        }
      },
    );
  }

  async runProvider(
    cutoffAt = new Date(),
    opts?: { forceIncomplete?: boolean },
  ) {
    return this.observability.startSpan(
      'reconciliation.provider',
      { cutoff: cutoffAt.toISOString() },
      async () => {
        const day = lagosDayIso(cutoffAt);
        const windowKey = windowKeyFor('provider', day);
        const locked = await this.tryAdvisoryLock(`recon:${windowKey}`);
        if (!locked) {
          this.logger.warn(
            `Skipping provider recon; lock held for ${windowKey}`,
          );
          return null;
        }
        try {
          // Provider pages are fetched via lightweight verify stubs; incomplete
          // if the caller signals pagination failure (fail closed).
          const providerComplete = opts?.forceIncomplete !== true;
          return await this.executeRun({
            kind: ReconciliationRunKind.PROVIDER,
            windowKey,
            cutoffAt,
            providerComplete,
            includeProviderChecks: true,
          });
        } finally {
          await this.releaseAdvisoryLock(`recon:${windowKey}`);
        }
      },
    );
  }

  async runTargeted(findingId: string) {
    const finding = await this.prisma.reconciliationFinding.findUniqueOrThrow({
      where: { id: findingId },
    });
    const cutoffAt = new Date();
    const windowKey = windowKeyFor(
      'targeted',
      lagosDayIso(cutoffAt),
      finding.fingerprint,
    );
    return this.executeRun({
      kind: ReconciliationRunKind.TARGETED,
      windowKey,
      cutoffAt,
      providerComplete: true,
      domainFilter: finding.domain,
    });
  }

  private async executeRun(params: {
    kind: ReconciliationRunKind;
    windowKey: string;
    cutoffAt: Date;
    providerComplete: boolean;
    includeProviderChecks?: boolean;
    domainFilter?: ReconciliationDomain;
  }) {
    const run = await this.prisma.reconciliationRun.upsert({
      where: {
        kind_windowKey: { kind: params.kind, windowKey: params.windowKey },
      },
      create: {
        kind: params.kind,
        windowKey: params.windowKey,
        cutoffAt: params.cutoffAt,
        status: ReconciliationRunStatus.RUNNING,
        startedAt: new Date(),
      },
      update: {
        status: ReconciliationRunStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
        errorSummary: null,
        recordsChecked: 0,
        findingsOpen: 0,
      },
    });

    try {
      if (!params.providerComplete) {
        await this.prisma.reconciliationRun.update({
          where: { id: run.id },
          data: {
            status: ReconciliationRunStatus.INCOMPLETE,
            finishedAt: new Date(),
            errorSummary: 'Provider pagination incomplete',
          },
        });
        return this.prisma.reconciliationRun.findUniqueOrThrow({
          where: { id: run.id },
        });
      }

      const drafts: FindingDraft[] = [];
      let recordsChecked = 0;

      const domains =
        params.domainFilter != null
          ? [params.domainFilter]
          : [
              ReconciliationDomain.PAYMENT,
              ReconciliationDomain.REFUND,
              ReconciliationDomain.PAYOUT,
              ReconciliationDomain.CAMPAIGN,
              ReconciliationDomain.INVENTORY,
            ];

      for (const domain of domains) {
        if (domain === ReconciliationDomain.PAYMENT) {
          const r = await this.checkPayments(params.cutoffAt);
          drafts.push(...r.findings);
          recordsChecked += r.checked;
        } else if (domain === ReconciliationDomain.REFUND) {
          const r = await this.checkRefunds(params.cutoffAt);
          drafts.push(...r.findings);
          recordsChecked += r.checked;
        } else if (domain === ReconciliationDomain.PAYOUT) {
          const r = await this.checkPayouts(params.cutoffAt);
          drafts.push(...r.findings);
          recordsChecked += r.checked;
        } else if (domain === ReconciliationDomain.CAMPAIGN) {
          const r = await this.checkCampaigns(params.cutoffAt);
          drafts.push(...r.findings);
          recordsChecked += r.checked;
        } else if (domain === ReconciliationDomain.INVENTORY) {
          const r = await this.checkInventory();
          drafts.push(...r.findings);
          recordsChecked += r.checked;
        }
      }

      if (params.includeProviderChecks) {
        const r = await this.checkProviderPresence(params.cutoffAt);
        drafts.push(...r.findings);
        recordsChecked += r.checked;
      }

      for (const draft of drafts) {
        await this.upsertOpenFinding(run.id, draft);
      }

      const openCount = await this.prisma.reconciliationFinding.count({
        where: { runId: run.id, status: 'OPEN' },
      });

      return this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationRunStatus.COMPLETED,
          finishedAt: new Date(),
          recordsChecked,
          findingsOpen: openCount,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`Reconciliation run ${run.id} failed: ${message}`);
      return this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationRunStatus.FAILED,
          finishedAt: new Date(),
          errorSummary: message.slice(0, 500),
        },
      });
    }
  }

  private async upsertOpenFinding(runId: string, draft: FindingDraft) {
    const existing = await this.prisma.reconciliationFinding.findFirst({
      where: { fingerprint: draft.fingerprint, status: 'OPEN' },
    });
    if (existing) {
      await this.prisma.reconciliationFinding.update({
        where: { id: existing.id },
        data: {
          runId,
          leftValue: draft.leftValue,
          rightValue: draft.rightValue,
          evidence: draft.evidence as Prisma.InputJsonValue | undefined,
          sourceIds: draft.sourceIds as Prisma.InputJsonValue | undefined,
          outcome: draft.outcome,
          severity: draft.severity,
        },
      });
      return;
    }
    await this.prisma.reconciliationFinding.create({
      data: {
        runId,
        domain: draft.domain,
        outcome: draft.outcome,
        severity: draft.severity,
        fingerprint: draft.fingerprint,
        leftLabel: draft.leftLabel,
        leftValue: draft.leftValue,
        rightLabel: draft.rightLabel,
        rightValue: draft.rightValue,
        currency: draft.currency,
        unit: draft.unit,
        sourceIds: draft.sourceIds as Prisma.InputJsonValue | undefined,
        evidence: draft.evidence as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private async checkPayments(cutoffAt: Date) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: { lte: cutoffAt },
      },
      select: {
        id: true,
        orderId: true,
        amount: true,
        currency: true,
        settlementClaim: { select: { id: true } },
        order: { select: { id: true, status: true, paymentStatus: true } },
      },
      take: 500,
    });
    const findings: FindingDraft[] = [];
    for (const payment of payments) {
      if (!payment.settlementClaim) {
        findings.push({
          domain: ReconciliationDomain.PAYMENT,
          outcome: ReconciliationOutcome.MISSING_INTERNAL,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.PAYMENT,
            outcome: ReconciliationOutcome.MISSING_INTERNAL,
            entityKey: `payment:${payment.id}:claim`,
          }),
          leftLabel: 'payment.status',
          leftValue: PaymentStatus.SUCCEEDED,
          rightLabel: 'chargeSettlementClaim',
          rightValue: 'missing',
          currency: payment.currency,
          sourceIds: { paymentId: payment.id, orderId: payment.orderId },
        });
      }
      const settledOrderStatuses: OrderStatus[] = [
        OrderStatus.PAID,
        OrderStatus.PROCESSING,
        OrderStatus.FULFILLED,
        OrderStatus.DELIVERED,
        OrderStatus.PARTIALLY_REFUNDED,
        OrderStatus.REFUNDED,
      ];
      if (
        payment.order.paymentStatus !== PaymentStatus.SUCCEEDED ||
        !settledOrderStatuses.includes(payment.order.status)
      ) {
        findings.push({
          domain: ReconciliationDomain.PAYMENT,
          outcome: ReconciliationOutcome.MISMATCH,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.PAYMENT,
            outcome: ReconciliationOutcome.MISMATCH,
            entityKey: `payment:${payment.id}:order`,
          }),
          leftLabel: 'payment.status',
          leftValue: PaymentStatus.SUCCEEDED,
          rightLabel: 'order.status/paymentStatus',
          rightValue: `${payment.order.status}/${payment.order.paymentStatus}`,
          currency: payment.currency,
          sourceIds: { paymentId: payment.id, orderId: payment.orderId },
        });
      }
    }
    return { findings, checked: payments.length };
  }

  private async checkRefunds(cutoffAt: Date) {
    const refunds = await this.prisma.refund.findMany({
      where: {
        status: RefundStatus.SUCCEEDED,
        createdAt: { lte: cutoffAt },
      },
      select: {
        id: true,
        orderId: true,
        amount: true,
        currency: true,
        settlementClaim: { select: { id: true } },
      },
      take: 500,
    });
    const findings: FindingDraft[] = [];
    for (const refund of refunds) {
      if (!refund.settlementClaim) {
        findings.push({
          domain: ReconciliationDomain.REFUND,
          outcome: ReconciliationOutcome.MISSING_INTERNAL,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.REFUND,
            outcome: ReconciliationOutcome.MISSING_INTERNAL,
            entityKey: `refund:${refund.id}:claim`,
          }),
          leftLabel: 'refund.status',
          leftValue: RefundStatus.SUCCEEDED,
          rightLabel: 'refundSettlementClaim',
          rightValue: 'missing',
          currency: refund.currency,
          sourceIds: { refundId: refund.id, orderId: refund.orderId },
        });
      }
      const ledger = await this.prisma.campaignBalanceLedgerEntry.count({
        where: {
          refundId: refund.id,
          entryType: LedgerEntryType.REFUND_APPLIED,
        },
      });
      // Campaign refunds should have a ledger row; non-campaign may have zero.
      if (ledger > 1) {
        findings.push({
          domain: ReconciliationDomain.REFUND,
          outcome: ReconciliationOutcome.MISMATCH,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.REFUND,
            outcome: ReconciliationOutcome.MISMATCH,
            entityKey: `refund:${refund.id}:ledger`,
          }),
          leftLabel: 'REFUND_APPLIED.count',
          leftValue: String(ledger),
          rightLabel: 'expected',
          rightValue: '<=1',
          currency: refund.currency,
          sourceIds: { refundId: refund.id },
        });
      }
    }
    return { findings, checked: refunds.length };
  }

  private async checkPayouts(cutoffAt: Date) {
    const payouts = await this.prisma.payout.findMany({
      where: { createdAt: { lte: cutoffAt } },
      select: { id: true, status: true, amount: true, currency: true },
      take: 500,
    });
    const findings: FindingDraft[] = [];
    for (const payout of payouts) {
      const net = await this.prisma.campaignBalanceLedgerEntry.aggregate({
        where: { payoutId: payout.id },
        _sum: { amount: true },
      });
      const netAmount = Number(net._sum.amount ?? 0);
      if (
        payout.status === PayoutStatus.SUCCEEDED &&
        Math.abs(netAmount) > 0.0001
      ) {
        findings.push({
          domain: ReconciliationDomain.PAYOUT,
          outcome: ReconciliationOutcome.MISMATCH,
          severity: ReconciliationSeverity.HIGH,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.PAYOUT,
            outcome: ReconciliationOutcome.MISMATCH,
            entityKey: `payout:${payout.id}:net`,
          }),
          leftLabel: 'payout.status',
          leftValue: payout.status,
          rightLabel: 'ledgerNet',
          rightValue: String(netAmount),
          currency: payout.currency,
          sourceIds: { payoutId: payout.id },
        });
      }
      if (
        (payout.status === PayoutStatus.INITIATED ||
          payout.status === PayoutStatus.PROCESSING ||
          payout.status === PayoutStatus.QUEUED) &&
        netAmount === 0
      ) {
        findings.push({
          domain: ReconciliationDomain.PAYOUT,
          outcome: ReconciliationOutcome.MISSING_INTERNAL,
          severity: ReconciliationSeverity.HIGH,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.PAYOUT,
            outcome: ReconciliationOutcome.MISSING_INTERNAL,
            entityKey: `payout:${payout.id}:reserve`,
          }),
          leftLabel: 'payout.status',
          leftValue: payout.status,
          rightLabel: 'ledgerNet',
          rightValue: '0',
          currency: payout.currency,
          sourceIds: { payoutId: payout.id },
        });
      }
    }
    return { findings, checked: payouts.length };
  }

  private async checkCampaigns(cutoffAt: Date) {
    const campaigns = await this.prisma.campaign.findMany({
      select: { id: true, currentAmount: true },
      take: 200,
    });
    const findings: FindingDraft[] = [];
    for (const campaign of campaigns) {
      const settled = await this.prisma.campaignBalanceLedgerEntry.aggregate({
        where: {
          campaignId: campaign.id,
          entryType: {
            in: [
              LedgerEntryType.PAYMENT_SETTLED,
              LedgerEntryType.REFUND_APPLIED,
            ],
          },
          createdAt: { lte: cutoffAt },
        },
        _sum: { amount: true },
      });
      const ledgerNet = Number(settled._sum.amount ?? 0);
      const display = Number(campaign.currentAmount);
      if (Math.abs(ledgerNet - display) > 0.01) {
        findings.push({
          domain: ReconciliationDomain.CAMPAIGN,
          outcome: ReconciliationOutcome.MISMATCH,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.CAMPAIGN,
            outcome: ReconciliationOutcome.MISMATCH,
            entityKey: `campaign:${campaign.id}:currentAmount`,
          }),
          leftLabel: 'campaign.currentAmount',
          leftValue: String(display),
          rightLabel: 'ledger PAYMENT_SETTLED+REFUND_APPLIED',
          rightValue: String(ledgerNet),
          sourceIds: { campaignId: campaign.id },
        });
      }
    }
    return { findings, checked: campaigns.length };
  }

  private async checkInventory() {
    const items = await this.prisma.inventoryItem.findMany({
      where: { trackInventory: true },
      select: { variantId: true, stockOnHand: true, reserved: true },
      take: 500,
    });
    const findings: FindingDraft[] = [];
    for (const item of items) {
      const movements = await this.prisma.inventoryMovement.findMany({
        where: { variantId: item.variantId },
        select: { reservedDelta: true, stockOnHandDelta: true, kind: true },
      });
      if (movements.length === 0) continue;
      const reservedDelta = movements.reduce((s, m) => s + m.reservedDelta, 0);
      const stockDelta = movements.reduce((s, m) => s + m.stockOnHandDelta, 0);
      // Movement-only truth for reserved after reserve/release/consume should match counter
      // for variants that have a full movement history starting from 0. Compare deltas to
      // counters when CONSUME/RELEASE/RESERVE are present.
      const hasReserve = movements.some(
        (m) => m.kind === InventoryMovementKind.RESERVE,
      );
      if (!hasReserve) continue;
      if (reservedDelta !== item.reserved) {
        findings.push({
          domain: ReconciliationDomain.INVENTORY,
          outcome: ReconciliationOutcome.MISMATCH,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.INVENTORY,
            outcome: ReconciliationOutcome.MISMATCH,
            entityKey: `variant:${item.variantId}:reserved`,
          }),
          leftLabel: 'inventory.reserved',
          leftValue: String(item.reserved),
          rightLabel: 'sum(movement.reservedDelta)',
          rightValue: String(reservedDelta),
          unit: 'units',
          sourceIds: { variantId: item.variantId },
        });
      }
      // stockOnHand absolute cannot be derived from deltas alone without opening balance;
      // flag only negative counters.
      if (item.stockOnHand < 0 || item.reserved < 0) {
        findings.push({
          domain: ReconciliationDomain.INVENTORY,
          outcome: ReconciliationOutcome.MISMATCH,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.INVENTORY,
            outcome: ReconciliationOutcome.MISMATCH,
            entityKey: `variant:${item.variantId}:negative`,
          }),
          leftLabel: 'stockOnHand/reserved',
          leftValue: `${item.stockOnHand}/${item.reserved}`,
          rightLabel: 'expected',
          rightValue: '>=0',
          unit: 'units',
          sourceIds: { variantId: item.variantId },
          evidence: { stockDelta },
        });
      }
    }
    return { findings, checked: items.length };
  }

  private async checkProviderPresence(cutoffAt: Date) {
    // Lightweight provider check: succeeded payments without providerRef are
    // UNVERIFIABLE externally. Full Paystack pagination is fail-closed via
    // runProvider({ forceIncomplete: true }) when pages cannot be fetched.
    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: { lte: cutoffAt },
        providerRef: null,
      },
      select: { id: true, orderId: true, currency: true },
      take: 100,
    });
    const findings: FindingDraft[] = payments.map((payment) => ({
      domain: ReconciliationDomain.PAYMENT,
      outcome: ReconciliationOutcome.UNVERIFIABLE,
      severity: ReconciliationSeverity.HIGH,
      fingerprint: fingerprintFinding({
        domain: ReconciliationDomain.PAYMENT,
        outcome: ReconciliationOutcome.UNVERIFIABLE,
        entityKey: `payment:${payment.id}:providerRef`,
      }),
      leftLabel: 'payment.providerRef',
      leftValue: 'null',
      rightLabel: 'provider',
      rightValue: 'unverifiable',
      currency: payment.currency,
      sourceIds: { paymentId: payment.id, orderId: payment.orderId },
    }));
    return { findings, checked: payments.length };
  }

  private async tryAdvisoryLock(key: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${key})) AS locked
    `;
    return Boolean(rows[0]?.locked);
  }

  private async releaseAdvisoryLock(key: string): Promise<void> {
    await this.prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${key}))`;
  }
}
