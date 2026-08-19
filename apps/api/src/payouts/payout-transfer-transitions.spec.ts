import { PayoutStatus } from '../generated/prisma/enums';
import {
  allowedFromStatuses,
  classifySkippedTransition,
  shouldRecordSuccessLedger,
  shouldReleaseReserve,
  transferEventToStatus,
} from './payout-transfer-transitions';

describe('payout-transfer-transitions', () => {
  it('maps webhook events to statuses', () => {
    expect(transferEventToStatus('transfer.success')).toBe(
      PayoutStatus.SUCCEEDED,
    );
    expect(transferEventToStatus('transfer.failed')).toBe(PayoutStatus.FAILED);
    expect(transferEventToStatus('transfer.reversed')).toBe(
      PayoutStatus.REVERSED,
    );
  });

  it('does not allow FAILED to overwrite SUCCEEDED', () => {
    expect(allowedFromStatuses(PayoutStatus.FAILED)).not.toContain(
      PayoutStatus.SUCCEEDED,
    );
  });

  it('allows REVERSED after SUCCEEDED and releases once', () => {
    expect(allowedFromStatuses(PayoutStatus.REVERSED)).toContain(
      PayoutStatus.SUCCEEDED,
    );
    expect(
      shouldReleaseReserve(PayoutStatus.SUCCEEDED, PayoutStatus.REVERSED),
    ).toBe(true);
    expect(
      shouldReleaseReserve(PayoutStatus.FAILED, PayoutStatus.REVERSED),
    ).toBe(false);
  });

  it('records success ledger only for SUCCEEDED', () => {
    expect(shouldRecordSuccessLedger(PayoutStatus.SUCCEEDED)).toBe(true);
    expect(shouldRecordSuccessLedger(PayoutStatus.FAILED)).toBe(false);
  });

  it('classifies skip outcomes', () => {
    expect(
      classifySkippedTransition(PayoutStatus.FAILED, PayoutStatus.FAILED),
    ).toBe('duplicate');
    expect(
      classifySkippedTransition(PayoutStatus.SUCCEEDED, PayoutStatus.FAILED),
    ).toBe('stale');
  });
});
