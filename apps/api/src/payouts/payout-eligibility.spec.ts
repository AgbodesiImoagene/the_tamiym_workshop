/**
 * TTW-042 slice 1 — payout eligibility matrix unit tests.
 */

import {
  PayoutProfileStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from '../organizer/organizer.constants';
import {
  evaluatePayoutEligibility,
  isPayoutAutoExecuteEnabled,
  maskAccountNumber,
  PayoutEligibilityCode,
  PayoutEligibilityGate,
  PAYOUT_ELIGIBILITY_POLICY_VERSION,
  resolvePayoutBankResolutionMode,
  resolveSchedulerPayoutMode,
  toPayoutEligibilitySnapshot,
} from './payout-eligibility';

const eligibleOrganiser = {
  id: 'org-1',
  role: UserRole.ORGANIZER,
  status: UserStatus.ACTIVE,
  emailVerifiedAt: new Date('2026-01-01'),
  phone: '+2348012345678',
  termsVersion: ORGANIZER_TERMS_VERSION,
};

const verifiedProfile = {
  id: 'prof-1',
  userId: 'org-1',
  status: PayoutProfileStatus.VERIFIED,
  bankResolutionStatus: 'STUB_MATCH',
  destinationVersion: 1,
};

describe('payout-eligibility', () => {
  it('allows a fully eligible organiser and verified destination', () => {
    const result = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.RUN_CREATE,
      organiser: eligibleOrganiser,
      profile: verifiedProfile,
    });
    expect(result.eligible).toBe(true);
    expect(result.policyVersion).toBe(PAYOUT_ELIGIBILITY_POLICY_VERSION);
    expect(result.codes).toEqual([PayoutEligibilityCode.ELIGIBLE]);
    expect(result.denials).toHaveLength(0);
  });

  it.each([
    [
      'inactive organiser',
      { status: UserStatus.SUSPENDED },
      PayoutEligibilityCode.ORGANISER_NOT_ACTIVE,
    ],
    [
      'non-organiser role',
      { role: UserRole.CUSTOMER },
      PayoutEligibilityCode.ORGANISER_ROLE_INVALID,
    ],
    [
      'unverified email',
      { emailVerifiedAt: null },
      PayoutEligibilityCode.EMAIL_UNVERIFIED,
    ],
    ['missing phone', { phone: '  ' }, PayoutEligibilityCode.PHONE_MISSING],
    [
      'stale terms',
      { termsVersion: 'old-terms' },
      PayoutEligibilityCode.TERMS_NOT_CURRENT,
    ],
  ] as const)('denies %s', (_label, override, code) => {
    const result = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.CAMPAIGN_ACTIVATE,
      organiser: { ...eligibleOrganiser, ...override },
      profile: verifiedProfile,
    });
    expect(result.eligible).toBe(false);
    expect(result.codes).toContain(code);
  });

  it('denies missing profile', () => {
    const result = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.PREVIEW,
      organiser: eligibleOrganiser,
      profile: null,
    });
    expect(result.codes).toContain(PayoutEligibilityCode.PROFILE_MISSING);
  });

  it('denies foreign profile', () => {
    const result = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.PREVIEW,
      organiser: eligibleOrganiser,
      profile: { ...verifiedProfile, userId: 'other' },
    });
    expect(result.codes).toContain(PayoutEligibilityCode.PROFILE_NOT_OWNED);
  });

  it.each([
    [
      PayoutProfileStatus.PENDING_VERIFICATION,
      PayoutEligibilityCode.PROFILE_NOT_VERIFIED,
    ],
    [
      PayoutProfileStatus.SUPERSEDED,
      PayoutEligibilityCode.PROFILE_NOT_VERIFIED,
    ],
    [PayoutProfileStatus.REJECTED, PayoutEligibilityCode.PROFILE_REJECTED],
    [PayoutProfileStatus.SUSPENDED, PayoutEligibilityCode.PROFILE_SUSPENDED],
  ] as const)('denies profile status %s', (status, code) => {
    const result = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.RUN_CREATE,
      organiser: eligibleOrganiser,
      profile: { ...verifiedProfile, status },
    });
    expect(result.codes).toContain(code);
  });

  it('execute recheck allows non-verified when flagged but still blocks suspended', () => {
    const ok = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.PROVIDER_INITIATE,
      organiser: eligibleOrganiser,
      profile: {
        ...verifiedProfile,
        status: PayoutProfileStatus.SUPERSEDED,
      },
      allowNonVerifiedProfile: true,
    });
    expect(ok.eligible).toBe(true);

    const blocked = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.PROVIDER_INITIATE,
      organiser: eligibleOrganiser,
      profile: {
        ...verifiedProfile,
        status: PayoutProfileStatus.SUSPENDED,
      },
      allowNonVerifiedProfile: true,
    });
    expect(blocked.codes).toContain(PayoutEligibilityCode.PROFILE_SUSPENDED);
  });

  it('denies unresolved bank', () => {
    const result = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.RUN_CREATE,
      organiser: eligibleOrganiser,
      profile: { ...verifiedProfile, bankResolutionStatus: null },
    });
    expect(result.codes).toContain(PayoutEligibilityCode.BANK_UNRESOLVED);
  });

  it('blocks AUTO_EXECUTE when env gate is off', () => {
    const result = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.RUN_CREATE,
      organiser: eligibleOrganiser,
      profile: verifiedProfile,
      autoExecuteRequested: true,
      autoExecuteEnabled: false,
    });
    expect(result.codes).toContain(PayoutEligibilityCode.AUTO_EXECUTE_DISABLED);
  });

  it('isPayoutAutoExecuteEnabled parses truthy strings', () => {
    expect(isPayoutAutoExecuteEnabled(undefined)).toBe(false);
    expect(isPayoutAutoExecuteEnabled('false')).toBe(false);
    expect(isPayoutAutoExecuteEnabled('true')).toBe(true);
    expect(isPayoutAutoExecuteEnabled('1')).toBe(true);
  });

  it('resolvePayoutBankResolutionMode defaults stub outside production', () => {
    expect(resolvePayoutBankResolutionMode(undefined, 'development')).toBe(
      'stub',
    );
    expect(resolvePayoutBankResolutionMode(undefined, 'production')).toBe(
      'live',
    );
    expect(resolvePayoutBankResolutionMode('live', 'development')).toBe('live');
  });

  it('resolveSchedulerPayoutMode falls back when AUTO_EXECUTE is gated off', () => {
    expect(resolveSchedulerPayoutMode('AUTO_EXECUTE', false)).toBe(
      'AUTO_APPROVAL_REQUIRED',
    );
    expect(resolveSchedulerPayoutMode('AUTO_EXECUTE', true)).toBe(
      'AUTO_EXECUTE',
    );
    expect(resolveSchedulerPayoutMode('MANUAL', false)).toBe('MANUAL');
  });

  it('masks account numbers and builds safe snapshots', () => {
    expect(maskAccountNumber('0123456789')).toBe('***6789');
    const result = evaluatePayoutEligibility({
      gate: PayoutEligibilityGate.RUN_CREATE,
      organiser: eligibleOrganiser,
      profile: verifiedProfile,
    });
    const snap = toPayoutEligibilitySnapshot(result, 'org-1');
    expect(JSON.stringify(snap)).not.toMatch(/0123456789/);
    expect(snap.organiserId).toBe('org-1');
  });
});
