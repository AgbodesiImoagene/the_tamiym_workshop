/**
 * Interim campaign readiness policy (TTW-034).
 * Snapshotted on readiness / decision responses; do not rewrite silently.
 */
export const CAMPAIGN_READINESS_POLICY_VERSION =
  'campaign-readiness/v1-interim-2026-08-21';

/** NotificationOutbox.eventName values (stable; no free-text labels). */
export const OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED =
  'organiser.campaign.approved';
export const OUTBOX_EVENT_ORGANIZER_CAMPAIGN_REJECTED =
  'organiser.campaign.rejected';
export const OUTBOX_EVENT_ORGANIZER_CAMPAIGN_RESUMED =
  'organiser.campaign.resumed';

export const CampaignReadinessPhase = {
  SUBMIT: 'submit',
  ACTIVATE: 'activate',
  RESUME: 'resume',
} as const;

export type CampaignReadinessPhase =
  (typeof CampaignReadinessPhase)[keyof typeof CampaignReadinessPhase];

export const CampaignReadinessCode = {
  TITLE_MISSING: 'CAMPAIGN_READINESS_TITLE_MISSING',
  DESCRIPTION_MISSING: 'CAMPAIGN_READINESS_DESCRIPTION_MISSING',
  STORY_MISSING: 'CAMPAIGN_READINESS_STORY_MISSING',
  DATE_ORDER_INVALID: 'CAMPAIGN_READINESS_DATE_ORDER_INVALID',
  NO_OFFERS: 'CAMPAIGN_READINESS_NO_OFFERS',
  OFFER_DESIGN_MISSING: 'CAMPAIGN_READINESS_OFFER_DESIGN_MISSING',
  OFFER_PRICE_INVALID: 'CAMPAIGN_READINESS_OFFER_PRICE_INVALID',
  DESIGN_REJECTED: 'CAMPAIGN_READINESS_DESIGN_REJECTED',
  ORGANISER_INELIGIBLE: 'CAMPAIGN_READINESS_ORGANISER_INELIGIBLE',
  TERMS_NOT_CURRENT: 'CAMPAIGN_READINESS_TERMS_NOT_CURRENT',
  DESIGN_NOT_APPROVED: 'CAMPAIGN_READINESS_DESIGN_NOT_APPROVED',
  PRODUCT_INACTIVE: 'CAMPAIGN_READINESS_PRODUCT_INACTIVE',
  NO_AVAILABLE_VARIANT: 'CAMPAIGN_READINESS_NO_AVAILABLE_VARIANT',
  END_DATE_INVALID: 'CAMPAIGN_READINESS_END_DATE_INVALID',
  REVISION_MISMATCH: 'CAMPAIGN_READINESS_REVISION_MISMATCH',
  SCHEDULED_START: 'CAMPAIGN_READINESS_SCHEDULED_START',
  /** @deprecated TTW-042 replaced deferred warning with hard payout codes below. */
  PAYOUT_DEFERRED: 'CAMPAIGN_READINESS_PAYOUT_DEFERRED',
  PAYOUT_ORGANISER_NOT_ACTIVE: 'PAYOUT_ORGANISER_NOT_ACTIVE',
  PAYOUT_ORGANISER_ROLE_INVALID: 'PAYOUT_ORGANISER_ROLE_INVALID',
  PAYOUT_EMAIL_UNVERIFIED: 'PAYOUT_EMAIL_UNVERIFIED',
  PAYOUT_PHONE_MISSING: 'PAYOUT_PHONE_MISSING',
  PAYOUT_TERMS_NOT_CURRENT: 'PAYOUT_TERMS_NOT_CURRENT',
  PAYOUT_PROFILE_MISSING: 'PAYOUT_PROFILE_MISSING',
  PAYOUT_PROFILE_NOT_OWNED: 'PAYOUT_PROFILE_NOT_OWNED',
  PAYOUT_PROFILE_NOT_VERIFIED: 'PAYOUT_PROFILE_NOT_VERIFIED',
  PAYOUT_PROFILE_SUSPENDED: 'PAYOUT_PROFILE_SUSPENDED',
  PAYOUT_PROFILE_REJECTED: 'PAYOUT_PROFILE_REJECTED',
  PAYOUT_BANK_UNRESOLVED: 'PAYOUT_BANK_UNRESOLVED',
} as const;

export type CampaignReadinessCode =
  (typeof CampaignReadinessCode)[keyof typeof CampaignReadinessCode];

export type CampaignReadinessIssue = {
  code: CampaignReadinessCode;
  message: string;
  /** Optional offer / design id for repair UX; never internal notes. */
  subjectId?: string;
};

export type CampaignReadinessResult = {
  policyVersion: string;
  phase: CampaignReadinessPhase;
  draftRevision: number;
  approvedRevision: number | null;
  blockers: CampaignReadinessIssue[];
  warnings: CampaignReadinessIssue[];
  ready: boolean;
};
