import { BadRequestException } from '@nestjs/common';
import {
  CampaignReadinessCode,
  type CampaignReadinessIssue,
  type CampaignReadinessResult,
  CAMPAIGN_READINESS_POLICY_VERSION,
} from './campaign-readiness.constants';

export function readinessBadRequest(
  result: CampaignReadinessResult,
): BadRequestException {
  const first = result.blockers[0];
  return new BadRequestException({
    message:
      first?.message ??
      'Campaign is not ready. Resolve readiness blockers and try again.',
    code: first?.code ?? CampaignReadinessCode.NO_OFFERS,
    readinessPolicyVersion: result.policyVersion,
    phase: result.phase,
    blockers: result.blockers,
    warnings: result.warnings,
    draftRevision: result.draftRevision,
    approvedRevision: result.approvedRevision,
  });
}

/** Boolean sellability only — never expose stock counts (TTW-031). */
export function isVariantSellable(variant: {
  isAvailable: boolean;
  inventory: {
    trackInventory: boolean;
    stockOnHand: number;
    reserved: number;
  } | null;
}): boolean {
  if (!variant.isAvailable) return false;
  const inv = variant.inventory;
  if (!inv || !inv.trackInventory) return true;
  return inv.stockOnHand - inv.reserved > 0;
}

export function issue(
  code: CampaignReadinessCode,
  message: string,
  subjectId?: string,
): CampaignReadinessIssue {
  return subjectId ? { code, message, subjectId } : { code, message };
}

export function emptyReadinessResult(
  phase: CampaignReadinessResult['phase'],
  draftRevision: number,
  approvedRevision: number | null,
): CampaignReadinessResult {
  return {
    policyVersion: CAMPAIGN_READINESS_POLICY_VERSION,
    phase,
    draftRevision,
    approvedRevision,
    blockers: [],
    warnings: [],
    ready: true,
  };
}
