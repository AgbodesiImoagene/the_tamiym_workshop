import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  InventoryMovementKind,
  LedgerEntryType,
  OrderStatus,
  PaymentStatus,
  PayoutStatus,
  ReconciliationDomain,
  ReconciliationFindingStatus,
  ReconciliationOutcome,
  ReconciliationRunKind,
  ReconciliationRunStatus,
  ReconciliationSeverity,
  RefundStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import { PaystackReconciliationClient } from './paystack-reconciliation.client';
import {
  FindingDraft,
  fingerprintFinding,
  lagosDayIso,
  windowKeyFor,
} from './reconciliation.util';

const PAGE_SIZE = 200;
/** ADR: 24h provider grace for in-flight settlement. */
const GRACE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReconciliationRunsService {
  private readonly logger = new Logger(ReconciliationRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: ObservabilityService,
    private readonly paystack: PaystackReconciliationClient,
  ) {}

  async runInternal(cutoffAt = new Date()) {
    return this.observability.startSpan(
      'reconciliation.internal',
      { cutoff: cutoffAt.toISOString() },
      async () => {
        const day = lagosDayIso(cutoffAt);
        const windowKey = windowKeyFor('internal', day);
        return this.prisma.withSessionAdvisoryLock(
          `recon:${windowKey}`,
          async () =>
            this.executeRun({
              kind: ReconciliationRunKind.INTERNAL,
              windowKey,
              cutoffAt,
              providerComplete: true,
            }),
        );
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
        return this.prisma.withSessionAdvisoryLock(
          `recon:${windowKey}`,
          async () => {
            if (opts?.forceIncomplete === true) {
              return this.executeRun({
                kind: ReconciliationRunKind.PROVIDER,
                windowKey,
                cutoffAt,
                providerComplete: false,
                providerErrorSummary: 'Provider pagination incomplete (forced)',
              });
            }

            const toDay = cutoffAt.toISOString().slice(0, 10);
            const fromDay = new Date(
              cutoffAt.getTime() - 7 * 24 * 60 * 60 * 1000,
            )
              .toISOString()
              .slice(0, 10);
            // Align local comparisons to the same calendar-day window Paystack receives.
            const fromAt = new Date(`${fromDay}T00:00:00.000Z`);
            const toAtExclusive = new Date(`${toDay}T23:59:59.999Z`);
            const fromIso = fromDay;
            const toIso = toDay;

            const [txns, refunds, transfers] = await Promise.all([
              this.paystack.listTransactions({ fromIso, toIso }),
              this.paystack.listRefunds({ fromIso, toIso }),
              this.paystack.listTransfers({ fromIso, toIso }),
            ]);

            const incomplete = [txns, refunds, transfers].find(
              (r) => !r.complete,
            );
            if (incomplete) {
              return this.executeRun({
                kind: ReconciliationRunKind.PROVIDER,
                windowKey,
                cutoffAt: toAtExclusive,
                providerComplete: false,
                providerErrorSummary:
                  incomplete.errorSummary ?? 'Provider pagination incomplete',
                cursor: {
                  transactionsPages: txns.pagesFetched,
                  refundsPages: refunds.pagesFetched,
                  transfersPages: transfers.pagesFetched,
                },
              });
            }

            return this.executeRun({
              kind: ReconciliationRunKind.PROVIDER,
              windowKey,
              cutoffAt: toAtExclusive,
              providerComplete: true,
              includeProviderChecks: true,
              providerWindowFrom: fromAt,
              providerSnapshot: {
                transactions: txns.items,
                refunds: refunds.items,
                transfers: transfers.items,
              },
              cursor: {
                transactionsPages: txns.pagesFetched,
                refundsPages: refunds.pagesFetched,
                transfersPages: transfers.pagesFetched,
                transactions: txns.items.length,
                refunds: refunds.items.length,
                transfers: transfers.items.length,
                fromDay,
                toDay,
              },
            });
          },
        );
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
    providerErrorSummary?: string;
    providerWindowFrom?: Date;
    providerSnapshot?: {
      transactions: Array<{
        reference: string;
        status: string;
        amountKobo: number;
        currency: string;
      }>;
      refunds: Array<{
        id: number;
        status: string;
        amountKobo: number;
        currency: string;
      }>;
      transfers: Array<{
        reference: string;
        status: string;
        amountKobo: number;
        currency: string;
      }>;
    };
    cursor?: Record<string, unknown>;
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
        cursor: (params.cursor ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
      update: {
        status: ReconciliationRunStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
        errorSummary: null,
        recordsChecked: 0,
        findingsOpen: 0,
        cursor: (params.cursor ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });

    try {
      if (!params.providerComplete) {
        await this.prisma.reconciliationRun.update({
          where: { id: run.id },
          data: {
            status: ReconciliationRunStatus.INCOMPLETE,
            finishedAt: new Date(),
            errorSummary:
              params.providerErrorSummary ?? 'Provider pagination incomplete',
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

      if (params.includeProviderChecks && params.providerSnapshot) {
        const r = await this.checkAgainstProvider(
          params.cutoffAt,
          params.providerSnapshot,
          params.providerWindowFrom ??
            new Date(params.cutoffAt.getTime() - 7 * 24 * 60 * 60 * 1000),
        );
        drafts.push(...r.findings);
        recordsChecked += r.checked;
      }

      for (const draft of drafts) {
        await this.upsertActiveFinding(run.id, draft);
      }

      const openCount = await this.prisma.reconciliationFinding.count({
        where: {
          runId: run.id,
          status: {
            in: [
              ReconciliationFindingStatus.OPEN,
              ReconciliationFindingStatus.ACKNOWLEDGED,
            ],
          },
        },
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

  private async upsertActiveFinding(runId: string, draft: FindingDraft) {
    const existing = await this.prisma.reconciliationFinding.findFirst({
      where: {
        fingerprint: draft.fingerprint,
        status: {
          in: [
            ReconciliationFindingStatus.OPEN,
            ReconciliationFindingStatus.ACKNOWLEDGED,
          ],
        },
      },
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

  private async paginateIds<T extends { id: string }>(
    fetchPage: (cursorId: string | undefined) => Promise<T[]>,
    onRow: (row: T) => Promise<void> | void,
  ): Promise<number> {
    let cursorId: string | undefined;
    let checked = 0;
    for (;;) {
      const batch = await fetchPage(cursorId);
      if (batch.length === 0) break;
      for (const row of batch) {
        await onRow(row);
      }
      checked += batch.length;
      cursorId = batch[batch.length - 1]?.id;
      if (batch.length < PAGE_SIZE) break;
    }
    return checked;
  }

  private withinGrace(createdAt: Date, now: Date): boolean {
    return now.getTime() - createdAt.getTime() < GRACE_MS;
  }

  private async checkPayments(cutoffAt: Date) {
    const findings: FindingDraft[] = [];
    const settledOrderStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.FULFILLED,
      OrderStatus.DELIVERED,
      OrderStatus.PARTIALLY_REFUNDED,
      OrderStatus.REFUNDED,
    ];

    const checked = await this.paginateIds(
      (cursorId) =>
        this.prisma.payment.findMany({
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
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        }),
      (payment) => {
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
      },
    );
    return { findings, checked };
  }

  private async checkRefunds(cutoffAt: Date) {
    const findings: FindingDraft[] = [];
    const checked = await this.paginateIds(
      (cursorId) =>
        this.prisma.refund.findMany({
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
            order: { select: { campaignId: true } },
          },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        }),
      async (refund) => {
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
        if (refund.order.campaignId && ledger === 0) {
          findings.push({
            domain: ReconciliationDomain.REFUND,
            outcome: ReconciliationOutcome.MISSING_INTERNAL,
            severity: ReconciliationSeverity.CRITICAL,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.REFUND,
              outcome: ReconciliationOutcome.MISSING_INTERNAL,
              entityKey: `refund:${refund.id}:ledgerMissing`,
            }),
            leftLabel: 'REFUND_APPLIED.count',
            leftValue: '0',
            rightLabel: 'expected',
            rightValue: '1',
            currency: refund.currency,
            sourceIds: {
              refundId: refund.id,
              campaignId: refund.order.campaignId,
            },
          });
        }
      },
    );
    return { findings, checked };
  }

  private async checkPayouts(cutoffAt: Date) {
    const findings: FindingDraft[] = [];
    const checked = await this.paginateIds(
      (cursorId) =>
        this.prisma.payout.findMany({
          where: { createdAt: { lte: cutoffAt } },
          select: {
            id: true,
            status: true,
            amount: true,
            currency: true,
            createdAt: true,
          },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        }),
      async (payout) => {
        const net = await this.prisma.campaignBalanceLedgerEntry.aggregate({
          where: { payoutId: payout.id },
          _sum: { amount: true },
        });
        const netAmount = Number(net._sum.amount ?? 0);
        const amount = Number(payout.amount);
        // SUCCEEDED: reserve (-amount) + succeeded(0) → expected net ≈ -amount
        if (payout.status === PayoutStatus.SUCCEEDED) {
          const expected = -amount;
          if (Math.abs(netAmount - expected) > 0.0001) {
            findings.push({
              domain: ReconciliationDomain.PAYOUT,
              outcome: ReconciliationOutcome.MISMATCH,
              severity: ReconciliationSeverity.CRITICAL,
              fingerprint: fingerprintFinding({
                domain: ReconciliationDomain.PAYOUT,
                outcome: ReconciliationOutcome.MISMATCH,
                entityKey: `payout:${payout.id}:net`,
              }),
              leftLabel: 'expectedLedgerNet',
              leftValue: String(expected),
              rightLabel: 'ledgerNet',
              rightValue: String(netAmount),
              currency: payout.currency,
              sourceIds: { payoutId: payout.id },
            });
          }
        }

        // Terminal release states: reserve must be fully released (net ≈ 0).
        if (
          payout.status === PayoutStatus.FAILED ||
          payout.status === PayoutStatus.REVERSED ||
          payout.status === PayoutStatus.CANCELLED
        ) {
          if (Math.abs(netAmount) > 0.0001) {
            findings.push({
              domain: ReconciliationDomain.PAYOUT,
              outcome: ReconciliationOutcome.MISMATCH,
              severity: ReconciliationSeverity.CRITICAL,
              fingerprint: fingerprintFinding({
                domain: ReconciliationDomain.PAYOUT,
                outcome: ReconciliationOutcome.MISMATCH,
                entityKey: `payout:${payout.id}:released`,
              }),
              leftLabel: 'expectedLedgerNet',
              leftValue: '0',
              rightLabel: 'ledgerNet',
              rightValue: String(netAmount),
              currency: payout.currency,
              sourceIds: { payoutId: payout.id },
            });
          }
        }

        const inFlight =
          payout.status === PayoutStatus.INITIATED ||
          payout.status === PayoutStatus.PROCESSING;
        // QUEUED is approved-but-not-yet-reserved; reserve is created at execution.
        // Missing internal reserve is never provider grace — flag HIGH immediately.
        if (inFlight && Math.abs(netAmount + amount) > 0.0001) {
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
            rightValue: String(netAmount),
            currency: payout.currency,
            sourceIds: { payoutId: payout.id },
          });
        }
      },
    );
    return { findings, checked };
  }

  private async checkCampaigns(cutoffAt: Date) {
    const findings: FindingDraft[] = [];
    const checked = await this.paginateIds(
      (cursorId) =>
        this.prisma.campaign.findMany({
          select: { id: true, currentAmount: true },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        }),
      async (campaign) => {
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
      },
    );
    return { findings, checked };
  }

  private async checkInventory() {
    const findings: FindingDraft[] = [];
    let checked = 0;
    let cursorId: string | undefined;
    for (;;) {
      const batch = await this.prisma.inventoryItem.findMany({
        where: { trackInventory: true },
        select: { variantId: true, stockOnHand: true, reserved: true },
        orderBy: { variantId: 'asc' },
        take: PAGE_SIZE,
        ...(cursorId ? { skip: 1, cursor: { variantId: cursorId } } : {}),
      });
      if (batch.length === 0) break;
      for (const item of batch) {
        const movements = await this.prisma.inventoryMovement.findMany({
          where: { variantId: item.variantId },
          select: {
            reservedDelta: true,
            stockOnHandDelta: true,
            kind: true,
          },
        });
        if (movements.length === 0) continue;
        const reservedDelta = movements.reduce(
          (s, m) => s + m.reservedDelta,
          0,
        );
        const stockDelta = movements.reduce(
          (s, m) => s + m.stockOnHandDelta,
          0,
        );
        const hasReserve = movements.some(
          (m) => m.kind === InventoryMovementKind.RESERVE,
        );
        if (hasReserve && reservedDelta !== item.reserved) {
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
        // When consume/release history exists, stock counter must stay
        // non-negative and available (on-hand - reserved) must be >= 0.
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
        } else if (item.stockOnHand < item.reserved) {
          findings.push({
            domain: ReconciliationDomain.INVENTORY,
            outcome: ReconciliationOutcome.MISMATCH,
            severity: ReconciliationSeverity.CRITICAL,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.INVENTORY,
              outcome: ReconciliationOutcome.MISMATCH,
              entityKey: `variant:${item.variantId}:available`,
            }),
            leftLabel: 'available',
            leftValue: String(item.stockOnHand - item.reserved),
            rightLabel: 'expected',
            rightValue: '>=0',
            unit: 'units',
            sourceIds: { variantId: item.variantId },
          });
        }
      }
      checked += batch.length;
      cursorId = batch[batch.length - 1]?.variantId;
      if (batch.length < PAGE_SIZE) break;
    }
    return { findings, checked };
  }

  private async checkAgainstProvider(
    cutoffAt: Date,
    snapshot: {
      transactions: Array<{
        reference: string;
        status: string;
        amountKobo: number;
        currency: string;
      }>;
      refunds: Array<{
        id: number;
        status: string;
        amountKobo: number;
        currency: string;
      }>;
      transfers: Array<{
        reference: string;
        status: string;
        amountKobo: number;
        currency: string;
      }>;
    },
    windowFrom: Date,
  ) {
    const findings: FindingDraft[] = [];
    let checked = 0;
    const txnByRef = new Map(
      snapshot.transactions.map((t) => [t.reference, t]),
    );
    const refundById = new Map(snapshot.refunds.map((r) => [String(r.id), r]));
    const transferByRef = new Map(
      snapshot.transfers.map((t) => [t.reference, t]),
    );
    const localPaymentRefs = new Set<string>();
    const localRefundRefs = new Set<string>();
    const localTransferRefs = new Set<string>();

    checked += await this.paginateIds(
      (cursorId) =>
        this.prisma.payment.findMany({
          where: {
            status: PaymentStatus.SUCCEEDED,
            createdAt: { gte: windowFrom, lte: cutoffAt },
          },
          select: {
            id: true,
            orderId: true,
            amount: true,
            currency: true,
            providerRef: true,
            createdAt: true,
          },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        }),
      (payment) => {
        if (payment.providerRef) localPaymentRefs.add(payment.providerRef);
        if (!payment.providerRef) {
          findings.push({
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
          });
          return;
        }
        const remote = txnByRef.get(payment.providerRef);
        if (!remote) {
          const grace = this.withinGrace(payment.createdAt, cutoffAt);
          findings.push({
            domain: ReconciliationDomain.PAYMENT,
            outcome: grace
              ? ReconciliationOutcome.PENDING_GRACE
              : ReconciliationOutcome.MISSING_PROVIDER,
            severity: grace
              ? ReconciliationSeverity.LOW
              : ReconciliationSeverity.CRITICAL,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.PAYMENT,
              outcome: grace
                ? ReconciliationOutcome.PENDING_GRACE
                : ReconciliationOutcome.MISSING_PROVIDER,
              entityKey: `payment:${payment.id}:provider`,
            }),
            leftLabel: 'payment.providerRef',
            leftValue: payment.providerRef,
            rightLabel: 'paystack.transaction',
            rightValue: 'missing',
            currency: payment.currency,
            sourceIds: { paymentId: payment.id },
          });
          return;
        }
        const localKobo = Math.round(Number(payment.amount) * 100);
        if (
          remote.status !== 'success' ||
          remote.amountKobo !== localKobo ||
          remote.currency !== payment.currency
        ) {
          findings.push({
            domain: ReconciliationDomain.PAYMENT,
            outcome: ReconciliationOutcome.MISMATCH,
            severity: ReconciliationSeverity.CRITICAL,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.PAYMENT,
              outcome: ReconciliationOutcome.MISMATCH,
              entityKey: `payment:${payment.id}:providerAmount`,
            }),
            leftLabel: 'local',
            leftValue: `${payment.currency}:${localKobo}:SUCCEEDED`,
            rightLabel: 'paystack',
            rightValue: `${remote.currency}:${remote.amountKobo}:${remote.status}`,
            currency: payment.currency,
            sourceIds: { paymentId: payment.id },
          });
        }
      },
    );

    checked += await this.paginateIds(
      (cursorId) =>
        this.prisma.refund.findMany({
          where: {
            status: RefundStatus.SUCCEEDED,
            createdAt: { gte: windowFrom, lte: cutoffAt },
          },
          select: {
            id: true,
            amount: true,
            currency: true,
            providerRef: true,
            createdAt: true,
          },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        }),
      (refund) => {
        if (refund.providerRef) localRefundRefs.add(refund.providerRef);
        if (!refund.providerRef) {
          findings.push({
            domain: ReconciliationDomain.REFUND,
            outcome: ReconciliationOutcome.UNVERIFIABLE,
            severity: ReconciliationSeverity.HIGH,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.REFUND,
              outcome: ReconciliationOutcome.UNVERIFIABLE,
              entityKey: `refund:${refund.id}:providerRef`,
            }),
            leftLabel: 'refund.providerRef',
            leftValue: 'null',
            rightLabel: 'provider',
            rightValue: 'unverifiable',
            currency: refund.currency,
            sourceIds: { refundId: refund.id },
          });
          return;
        }
        const remote = refundById.get(refund.providerRef);
        if (!remote) {
          const grace = this.withinGrace(refund.createdAt, cutoffAt);
          findings.push({
            domain: ReconciliationDomain.REFUND,
            outcome: grace
              ? ReconciliationOutcome.PENDING_GRACE
              : ReconciliationOutcome.MISSING_PROVIDER,
            severity: grace
              ? ReconciliationSeverity.LOW
              : ReconciliationSeverity.CRITICAL,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.REFUND,
              outcome: grace
                ? ReconciliationOutcome.PENDING_GRACE
                : ReconciliationOutcome.MISSING_PROVIDER,
              entityKey: `refund:${refund.id}:provider`,
            }),
            leftLabel: 'refund.providerRef',
            leftValue: refund.providerRef,
            rightLabel: 'paystack.refund',
            rightValue: 'missing',
            currency: refund.currency,
            sourceIds: { refundId: refund.id },
          });
          return;
        }
        const localKobo = Math.round(Number(refund.amount) * 100);
        const okStatus = ['processed', 'success'].includes(remote.status);
        if (
          !okStatus ||
          remote.amountKobo !== localKobo ||
          remote.currency !== refund.currency
        ) {
          findings.push({
            domain: ReconciliationDomain.REFUND,
            outcome: ReconciliationOutcome.MISMATCH,
            severity: ReconciliationSeverity.CRITICAL,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.REFUND,
              outcome: ReconciliationOutcome.MISMATCH,
              entityKey: `refund:${refund.id}:providerAmount`,
            }),
            leftLabel: 'local',
            leftValue: `${refund.currency}:${localKobo}:SUCCEEDED`,
            rightLabel: 'paystack',
            rightValue: `${remote.currency}:${remote.amountKobo}:${remote.status}`,
            currency: refund.currency,
            sourceIds: { refundId: refund.id },
          });
        }
      },
    );

    checked += await this.paginateIds(
      (cursorId) =>
        this.prisma.payout.findMany({
          where: {
            status: PayoutStatus.SUCCEEDED,
            createdAt: { gte: windowFrom, lte: cutoffAt },
          },
          select: {
            id: true,
            amount: true,
            currency: true,
            providerRef: true,
            createdAt: true,
          },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        }),
      (payout) => {
        if (payout.providerRef) localTransferRefs.add(payout.providerRef);
        if (!payout.providerRef) {
          findings.push({
            domain: ReconciliationDomain.PAYOUT,
            outcome: ReconciliationOutcome.UNVERIFIABLE,
            severity: ReconciliationSeverity.HIGH,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.PAYOUT,
              outcome: ReconciliationOutcome.UNVERIFIABLE,
              entityKey: `payout:${payout.id}:providerRef`,
            }),
            leftLabel: 'payout.providerRef',
            leftValue: 'null',
            rightLabel: 'provider',
            rightValue: 'unverifiable',
            currency: payout.currency,
            sourceIds: { payoutId: payout.id },
          });
          return;
        }
        const remote = transferByRef.get(payout.providerRef);
        if (!remote) {
          const grace = this.withinGrace(payout.createdAt, cutoffAt);
          findings.push({
            domain: ReconciliationDomain.PAYOUT,
            outcome: grace
              ? ReconciliationOutcome.PENDING_GRACE
              : ReconciliationOutcome.MISSING_PROVIDER,
            severity: grace
              ? ReconciliationSeverity.LOW
              : ReconciliationSeverity.CRITICAL,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.PAYOUT,
              outcome: grace
                ? ReconciliationOutcome.PENDING_GRACE
                : ReconciliationOutcome.MISSING_PROVIDER,
              entityKey: `payout:${payout.id}:provider`,
            }),
            leftLabel: 'payout.providerRef',
            leftValue: payout.providerRef,
            rightLabel: 'paystack.transfer',
            rightValue: 'missing',
            currency: payout.currency,
            sourceIds: { payoutId: payout.id },
          });
          return;
        }
        const localKobo = Math.round(Number(payout.amount) * 100);
        if (
          remote.status !== 'success' ||
          remote.amountKobo !== localKobo ||
          remote.currency !== payout.currency
        ) {
          findings.push({
            domain: ReconciliationDomain.PAYOUT,
            outcome: ReconciliationOutcome.MISMATCH,
            severity: ReconciliationSeverity.CRITICAL,
            fingerprint: fingerprintFinding({
              domain: ReconciliationDomain.PAYOUT,
              outcome: ReconciliationOutcome.MISMATCH,
              entityKey: `payout:${payout.id}:providerAmount`,
            }),
            leftLabel: 'local',
            leftValue: `${payout.currency}:${localKobo}:SUCCEEDED`,
            rightLabel: 'paystack',
            rightValue: `${remote.currency}:${remote.amountKobo}:${remote.status}`,
            currency: payout.currency,
            sourceIds: { payoutId: payout.id },
          });
        }
      },
    );

    for (const remote of snapshot.transactions) {
      if (remote.status !== 'success') continue;
      checked += 1;
      if (!localPaymentRefs.has(remote.reference)) {
        findings.push({
          domain: ReconciliationDomain.PAYMENT,
          outcome: ReconciliationOutcome.MISSING_INTERNAL,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.PAYMENT,
            outcome: ReconciliationOutcome.MISSING_INTERNAL,
            entityKey: `providerTxn:${remote.reference}`,
          }),
          leftLabel: 'paystack.transaction',
          leftValue: remote.reference,
          rightLabel: 'local.payment',
          rightValue: 'missing',
          currency: remote.currency,
          sourceIds: { providerRef: remote.reference },
        });
      }
    }
    for (const remote of snapshot.refunds) {
      if (!['processed', 'success'].includes(remote.status)) continue;
      checked += 1;
      if (!localRefundRefs.has(String(remote.id))) {
        findings.push({
          domain: ReconciliationDomain.REFUND,
          outcome: ReconciliationOutcome.MISSING_INTERNAL,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.REFUND,
            outcome: ReconciliationOutcome.MISSING_INTERNAL,
            entityKey: `providerRefund:${remote.id}`,
          }),
          leftLabel: 'paystack.refund',
          leftValue: String(remote.id),
          rightLabel: 'local.refund',
          rightValue: 'missing',
          currency: remote.currency,
          sourceIds: { providerRef: String(remote.id) },
        });
      }
    }
    for (const remote of snapshot.transfers) {
      if (remote.status !== 'success') continue;
      checked += 1;
      if (!localTransferRefs.has(remote.reference)) {
        findings.push({
          domain: ReconciliationDomain.PAYOUT,
          outcome: ReconciliationOutcome.MISSING_INTERNAL,
          severity: ReconciliationSeverity.CRITICAL,
          fingerprint: fingerprintFinding({
            domain: ReconciliationDomain.PAYOUT,
            outcome: ReconciliationOutcome.MISSING_INTERNAL,
            entityKey: `providerTransfer:${remote.reference}`,
          }),
          leftLabel: 'paystack.transfer',
          leftValue: remote.reference,
          rightLabel: 'local.payout',
          rightValue: 'missing',
          currency: remote.currency,
          sourceIds: { providerRef: remote.reference },
        });
      }
    }

    return { findings, checked };
  }
}
