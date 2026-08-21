/**
 * Shared loaders / assertion helpers for TTW-042 payout eligibility gates.
 */

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizerApplicationStatus } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import {
  evaluatePayoutEligibility,
  isPayoutAutoExecuteEnabled,
  PayoutEligibilityGate,
  type PayoutEligibilityOrganiser,
  type PayoutEligibilityProfile,
  type PayoutEligibilityResult,
  toPayoutEligibilitySnapshot,
  type PayoutEligibilitySnapshot,
  PAYOUT_ELIGIBILITY_POLICY_VERSION,
} from './payout-eligibility';

type PrismaLike = Pick<PrismaService, 'user' | 'userPayoutProfile'>;

export async function loadPayoutEligibilityOrganiser(
  prisma: PrismaLike,
  organiserId: string,
): Promise<PayoutEligibilityOrganiser | null> {
  const user = await prisma.user.findUnique({
    where: { id: organiserId },
    select: {
      id: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      phone: true,
      organizerApplications: {
        where: { status: OrganizerApplicationStatus.APPROVED },
        orderBy: { reviewedAt: 'desc' },
        take: 1,
        select: { termsVersion: true },
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    phone: user.phone,
    termsVersion: user.organizerApplications[0]?.termsVersion ?? null,
  };
}

export function toEligibilityProfile(profile: {
  id: string;
  userId: string;
  status: PayoutEligibilityProfile['status'];
  bankResolutionStatus: string | null;
  destinationVersion: number;
}): PayoutEligibilityProfile {
  return {
    id: profile.id,
    userId: profile.userId,
    status: profile.status,
    bankResolutionStatus: profile.bankResolutionStatus,
    destinationVersion: profile.destinationVersion,
  };
}

export function assertPayoutEligible(
  result: PayoutEligibilityResult,
): asserts result is PayoutEligibilityResult & { eligible: true } {
  if (result.eligible) return;
  const first = result.denials[0];
  throw new BadRequestException({
    message: first?.message ?? 'Payout eligibility failed',
    code: first?.code ?? result.codes[0],
    policyVersion: result.policyVersion,
    gate: result.gate,
    denials: result.denials,
  });
}

export function readAutoExecuteEnabled(config: ConfigService): boolean {
  return isPayoutAutoExecuteEnabled(
    config.get<string>('PAYOUT_AUTO_EXECUTE_ENABLED'),
  );
}

/** Throws BadRequest when AUTO_EXECUTE is requested but env gate is off. */
export function assertAutoExecuteModeAllowed(
  mode: string | null | undefined,
  autoExecuteEnabled: boolean,
): void {
  if (mode !== 'AUTO_EXECUTE') return;
  if (autoExecuteEnabled) return;
  throw new BadRequestException({
    message:
      'AUTO_EXECUTE is blocked until PAYOUT_AUTO_EXECUTE_ENABLED=true and clean-run evidence is recorded (TTW-042).',
    code: 'PAYOUT_AUTO_EXECUTE_DISABLED',
    policyVersion: PAYOUT_ELIGIBILITY_POLICY_VERSION,
  });
}

export function evaluateForGate(params: {
  gate: (typeof PayoutEligibilityGate)[keyof typeof PayoutEligibilityGate];
  organiser: PayoutEligibilityOrganiser;
  profile: PayoutEligibilityProfile | null;
  allowNonVerifiedProfile?: boolean;
  autoExecuteRequested?: boolean;
  autoExecuteEnabled?: boolean;
}): PayoutEligibilityResult {
  return evaluatePayoutEligibility(params);
}

export function snapshotFromResult(
  result: PayoutEligibilityResult,
  organiserId: string,
): PayoutEligibilitySnapshot {
  return toPayoutEligibilitySnapshot(result, organiserId);
}

export { PayoutEligibilityGate };
