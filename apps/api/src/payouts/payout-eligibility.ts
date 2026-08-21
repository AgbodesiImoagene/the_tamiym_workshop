/**
 * TTW-042 slice 1 — pure payout eligibility evaluator.
 * Policy: docs/payouts/ttw-042-interim-policy.md
 *
 * Server authority only. Clients must not invent eligibility.
 * Snapshots must never include full account numbers or KYC documents.
 */

import {
  PayoutProfileStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from '../organizer/organizer.constants';

export const PAYOUT_ELIGIBILITY_POLICY_VERSION =
  'payout-eligibility/v1-interim-2026-08-21';

export const PayoutEligibilityGate = {
  CAMPAIGN_ACTIVATE: 'CAMPAIGN_ACTIVATE',
  CAMPAIGN_RESUME: 'CAMPAIGN_RESUME',
  PREVIEW: 'PREVIEW',
  RUN_CREATE: 'RUN_CREATE',
  RUN_APPROVE: 'RUN_APPROVE',
  PROVIDER_INITIATE: 'PROVIDER_INITIATE',
} as const;

export type PayoutEligibilityGate =
  (typeof PayoutEligibilityGate)[keyof typeof PayoutEligibilityGate];

export const PayoutEligibilityCode = {
  ELIGIBLE: 'PAYOUT_ELIGIBLE',
  ORGANISER_NOT_ACTIVE: 'PAYOUT_ORGANISER_NOT_ACTIVE',
  ORGANISER_ROLE_INVALID: 'PAYOUT_ORGANISER_ROLE_INVALID',
  EMAIL_UNVERIFIED: 'PAYOUT_EMAIL_UNVERIFIED',
  PHONE_MISSING: 'PAYOUT_PHONE_MISSING',
  TERMS_NOT_CURRENT: 'PAYOUT_TERMS_NOT_CURRENT',
  PROFILE_MISSING: 'PAYOUT_PROFILE_MISSING',
  PROFILE_NOT_OWNED: 'PAYOUT_PROFILE_NOT_OWNED',
  PROFILE_NOT_VERIFIED: 'PAYOUT_PROFILE_NOT_VERIFIED',
  PROFILE_SUSPENDED: 'PAYOUT_PROFILE_SUSPENDED',
  PROFILE_REJECTED: 'PAYOUT_PROFILE_REJECTED',
  BANK_UNRESOLVED: 'PAYOUT_BANK_UNRESOLVED',
  AUTO_EXECUTE_DISABLED: 'PAYOUT_AUTO_EXECUTE_DISABLED',
} as const;

export type PayoutEligibilityCode =
  (typeof PayoutEligibilityCode)[keyof typeof PayoutEligibilityCode];

const SAFE_MESSAGES: Record<PayoutEligibilityCode, string> = {
  [PayoutEligibilityCode.ELIGIBLE]: 'Payout destination is eligible.',
  [PayoutEligibilityCode.ORGANISER_NOT_ACTIVE]:
    'Organiser account must be active before payouts.',
  [PayoutEligibilityCode.ORGANISER_ROLE_INVALID]:
    'Only approved organisers can receive campaign payouts.',
  [PayoutEligibilityCode.EMAIL_UNVERIFIED]:
    'Verify the organiser email before payouts.',
  [PayoutEligibilityCode.PHONE_MISSING]:
    'Add a phone number on the organiser profile before payouts.',
  [PayoutEligibilityCode.TERMS_NOT_CURRENT]:
    'Accept the current organiser terms before payouts.',
  [PayoutEligibilityCode.PROFILE_MISSING]:
    'Add and verify a payout bank destination before continuing.',
  [PayoutEligibilityCode.PROFILE_NOT_OWNED]:
    'Payout destination must belong to the campaign organiser.',
  [PayoutEligibilityCode.PROFILE_NOT_VERIFIED]:
    'Payout destination must be verified before it can be used.',
  [PayoutEligibilityCode.PROFILE_SUSPENDED]:
    'Payout destination is suspended. Contact support.',
  [PayoutEligibilityCode.PROFILE_REJECTED]:
    'Payout destination was rejected. Add a new verified destination.',
  [PayoutEligibilityCode.BANK_UNRESOLVED]:
    'Bank account has not been resolved yet. Wait for verification.',
  [PayoutEligibilityCode.AUTO_EXECUTE_DISABLED]:
    'Automatic payout execution is disabled until clean-run evidence is recorded.',
};

export type PayoutEligibilityOrganiser = {
  id: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  phone: string | null;
  /** Latest approved organiser application terms version, if any. */
  termsVersion: string | null;
};

export type PayoutEligibilityProfile = {
  id: string;
  userId: string;
  status: PayoutProfileStatus;
  bankResolutionStatus: string | null;
  destinationVersion: number;
};

export type PayoutEligibilityInput = {
  gate: PayoutEligibilityGate;
  organiser: PayoutEligibilityOrganiser;
  profile: PayoutEligibilityProfile | null;
  /**
   * When true, skip VERIFIED requirement (execute recheck after snapshot).
   * Still blocks SUSPENDED / REJECTED / missing profile ownership.
   */
  allowNonVerifiedProfile?: boolean;
  /** When evaluating AUTO_EXECUTE mode selection. */
  autoExecuteRequested?: boolean;
  autoExecuteEnabled?: boolean;
};

export type PayoutEligibilityDenial = {
  code: Exclude<PayoutEligibilityCode, 'PAYOUT_ELIGIBLE'>;
  message: string;
};

export type PayoutEligibilityResult = {
  eligible: boolean;
  policyVersion: string;
  gate: PayoutEligibilityGate;
  codes: PayoutEligibilityCode[];
  denials: PayoutEligibilityDenial[];
  profileId: string | null;
  destinationVersion: number | null;
};

/** Safe JSON for payout.eligibilitySnapshot — no account numbers. */
export type PayoutEligibilitySnapshot = {
  policyVersion: string;
  gate: PayoutEligibilityGate;
  codes: PayoutEligibilityCode[];
  eligible: boolean;
  profileId: string | null;
  destinationVersion: number | null;
  organiserId: string;
};

export function messageForPayoutEligibilityCode(
  code: PayoutEligibilityCode,
): string {
  return SAFE_MESSAGES[code];
}

export function isPayoutAutoExecuteEnabled(
  raw: string | boolean | undefined | null,
): boolean {
  if (raw === true) return true;
  if (typeof raw !== 'string') return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Scheduler / site AUTO_EXECUTE falls back when the env gate is off (TTW-042).
 */
export function resolveSchedulerPayoutMode(
  mode: string,
  autoExecuteEnabled: boolean,
): string {
  if (mode === 'AUTO_EXECUTE' && !autoExecuteEnabled) {
    return 'AUTO_APPROVAL_REQUIRED';
  }
  return mode;
}

/**
 * Bank resolution mode. Stub is deterministic and allowed only outside production.
 */
export function resolvePayoutBankResolutionMode(
  raw: string | undefined | null,
  nodeEnv: string | undefined | null = process.env.NODE_ENV,
): 'stub' | 'live' {
  const isProd = nodeEnv === 'production';
  const mode = (raw ?? '').trim().toLowerCase();
  // Production is fail-closed: never stub, even on typos/empty/off.
  if (isProd) {
    return 'live';
  }
  if (mode === 'live') return 'live';
  return 'stub';
}

/**
 * Deterministic stub recipient for non-production snapshots so execute never
 * falls back to a live profile after bank edits.
 */
export function stubRecipientCodeForProfile(
  profileId: string,
  destinationVersion: number,
): string {
  return `STUB_RCP_${profileId}_v${destinationVersion}`;
}

export function evaluatePayoutEligibility(
  input: PayoutEligibilityInput,
): PayoutEligibilityResult {
  const codes: PayoutEligibilityCode[] = [];

  if (input.autoExecuteRequested && !input.autoExecuteEnabled) {
    codes.push(PayoutEligibilityCode.AUTO_EXECUTE_DISABLED);
  }

  if (input.organiser.status !== UserStatus.ACTIVE) {
    codes.push(PayoutEligibilityCode.ORGANISER_NOT_ACTIVE);
  }
  if (input.organiser.role !== UserRole.ORGANIZER) {
    codes.push(PayoutEligibilityCode.ORGANISER_ROLE_INVALID);
  }
  if (!input.organiser.emailVerifiedAt) {
    codes.push(PayoutEligibilityCode.EMAIL_UNVERIFIED);
  }
  if (!input.organiser.phone?.trim()) {
    codes.push(PayoutEligibilityCode.PHONE_MISSING);
  }
  if (
    !input.organiser.termsVersion ||
    input.organiser.termsVersion !== ORGANIZER_TERMS_VERSION
  ) {
    codes.push(PayoutEligibilityCode.TERMS_NOT_CURRENT);
  }

  const profile = input.profile;
  if (!profile) {
    codes.push(PayoutEligibilityCode.PROFILE_MISSING);
  } else {
    if (profile.userId !== input.organiser.id) {
      codes.push(PayoutEligibilityCode.PROFILE_NOT_OWNED);
    }
    if (profile.status === PayoutProfileStatus.SUSPENDED) {
      codes.push(PayoutEligibilityCode.PROFILE_SUSPENDED);
    } else if (profile.status === PayoutProfileStatus.REJECTED) {
      codes.push(PayoutEligibilityCode.PROFILE_REJECTED);
    } else if (
      !input.allowNonVerifiedProfile &&
      profile.status !== PayoutProfileStatus.VERIFIED
    ) {
      codes.push(PayoutEligibilityCode.PROFILE_NOT_VERIFIED);
    }
    if (!profile.bankResolutionStatus) {
      codes.push(PayoutEligibilityCode.BANK_UNRESOLVED);
    }
  }

  const denialCodes = codes.filter((c) => c !== PayoutEligibilityCode.ELIGIBLE);
  const eligible = denialCodes.length === 0;
  if (eligible) {
    codes.push(PayoutEligibilityCode.ELIGIBLE);
  }

  return {
    eligible,
    policyVersion: PAYOUT_ELIGIBILITY_POLICY_VERSION,
    gate: input.gate,
    codes: eligible ? [PayoutEligibilityCode.ELIGIBLE] : denialCodes,
    denials: denialCodes.map((code) => ({
      code,
      message: SAFE_MESSAGES[code],
    })),
    profileId: profile?.id ?? null,
    destinationVersion: profile?.destinationVersion ?? null,
  };
}

export function toPayoutEligibilitySnapshot(
  result: PayoutEligibilityResult,
  organiserId: string,
): PayoutEligibilitySnapshot {
  return {
    policyVersion: result.policyVersion,
    gate: result.gate,
    codes: result.codes,
    eligible: result.eligible,
    profileId: result.profileId,
    destinationVersion: result.destinationVersion,
    organiserId,
  };
}

export function maskAccountNumber(
  accountNumber: string | null | undefined,
): string | null {
  if (!accountNumber) return null;
  const digits = accountNumber.replace(/\s+/g, '');
  if (digits.length < 4) return '****';
  return `***${digits.slice(-4)}`;
}
