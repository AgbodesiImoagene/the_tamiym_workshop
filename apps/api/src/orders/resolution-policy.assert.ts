import { BadRequestException } from '@nestjs/common';
import type { EligibilityDecision } from './resolution-policy';

/**
 * Reject an illegal cancel/refund/return transition with a stable policy code.
 */
export function assertResolutionAllowed(decision: EligibilityDecision): void {
  if (decision.allowed) return;
  throw new BadRequestException({
    statusCode: 400,
    code: decision.code,
    message: decision.message,
    policyVersion: decision.policyVersion,
  });
}
