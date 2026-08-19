import { PayoutStatus } from '../generated/prisma/enums';

export type TransferWebhookEventName =
  | 'transfer.success'
  | 'transfer.failed'
  | 'transfer.reversed';

export type PayoutTransferOutcome = 'applied' | 'duplicate' | 'stale';

const TERMINAL: ReadonlySet<PayoutStatus> = new Set([
  PayoutStatus.SUCCEEDED,
  PayoutStatus.FAILED,
  PayoutStatus.REVERSED,
  PayoutStatus.CANCELLED,
]);

/**
 * Map Paystack transfer webhook event → target payout status.
 */
export function transferEventToStatus(
  event: TransferWebhookEventName,
): PayoutStatus {
  if (event === 'transfer.success') return PayoutStatus.SUCCEEDED;
  if (event === 'transfer.reversed') return PayoutStatus.REVERSED;
  return PayoutStatus.FAILED;
}

/**
 * Statuses from which a webhook may move a payout to `toStatus`.
 * Empty means the transition is never applied (stale or impossible).
 */
export function allowedFromStatuses(
  toStatus: PayoutStatus,
): readonly PayoutStatus[] {
  switch (toStatus) {
    case PayoutStatus.SUCCEEDED:
      return [PayoutStatus.INITIATED, PayoutStatus.PROCESSING];
    case PayoutStatus.FAILED:
      return [PayoutStatus.INITIATED, PayoutStatus.PROCESSING];
    case PayoutStatus.REVERSED:
      return [
        PayoutStatus.INITIATED,
        PayoutStatus.PROCESSING,
        PayoutStatus.SUCCEEDED,
        PayoutStatus.FAILED, // status-only; ledger release already applied if FAILED
      ];
    default:
      return [];
  }
}

/**
 * Whether applying `toStatus` should create a PAYOUT_FAILED release (+amount).
 * Success never releases. Reversal after success releases once. Failure from
 * in-flight statuses releases. Reversal after failure does not release again.
 */
export function shouldReleaseReserve(
  fromStatus: PayoutStatus,
  toStatus: PayoutStatus,
): boolean {
  if (toStatus === PayoutStatus.FAILED) {
    return (
      fromStatus === PayoutStatus.INITIATED ||
      fromStatus === PayoutStatus.PROCESSING
    );
  }
  if (toStatus === PayoutStatus.REVERSED) {
    return (
      fromStatus === PayoutStatus.INITIATED ||
      fromStatus === PayoutStatus.PROCESSING ||
      fromStatus === PayoutStatus.SUCCEEDED
    );
  }
  return false;
}

export function shouldRecordSuccessLedger(toStatus: PayoutStatus): boolean {
  return toStatus === PayoutStatus.SUCCEEDED;
}

export function isTerminalPayoutStatus(status: PayoutStatus): boolean {
  return TERMINAL.has(status);
}

export function classifySkippedTransition(
  current: PayoutStatus,
  toStatus: PayoutStatus,
): 'duplicate' | 'stale' {
  return current === toStatus ? 'duplicate' : 'stale';
}

export function payoutTransferBusinessKey(
  event: TransferWebhookEventName,
  providerRef: string,
): string {
  return `${event}:${providerRef}`;
}
