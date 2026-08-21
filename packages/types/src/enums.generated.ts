/**
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 *
 * This file is generated from the Prisma schema.
 * Run `pnpm --filter @tamiym/types generate:enums` to regenerate.
 *
 * Source: apps/api/prisma/schema.prisma
 */

/**
 * Shared TypeScript enums generated from Prisma schema
 *
 * @see apps/api/prisma/schema.prisma for the source of truth
 */

// Role of a user in the system (customer, organizer, or admin).
export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ORGANIZER = 'ORGANIZER',
  ADMIN = 'ADMIN',
}

// Lifecycle status of a user account.
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

// TTW-025 data-subject request kinds.
export enum PrivacyRequestType {
  EXPORT = 'EXPORT',
  ERASURE = 'ERASURE',
}

// TTW-025 privacy request lifecycle.
export enum PrivacyRequestStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  HELD = 'HELD',
}

// External identity provider linked to a user (e.g. Google OAuth).
export enum OAuthProvider {
  GOOGLE = 'GOOGLE',
}

// Type of one-time or session token stored in AuthToken.
export enum TokenType {
  REFRESH = 'REFRESH',
  PASSWORD_RESET = 'PASSWORD_RESET',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
}

// Nullable until legacy (pre-TTW-020) refresh tokens are revoked or expire.
export enum AuthSurface {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

// How a product image is used (thumbnail, gallery, or workshop template).
export enum ImageRole {
  THUMBNAIL = 'THUMBNAIL',
  GALLERY = 'GALLERY',
  WORKSHOP_TEMPLATE = 'WORKSHOP_TEMPLATE',
}

// Order lifecycle from draft/cart through payment, fulfillment, and delivery or refund.
export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  FULFILLED = 'FULFILLED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
}

// Status of a payment attempt for an order.
export enum PaymentStatus {
  PENDING = 'PENDING',
  INITIATED = 'INITIATED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

// PAUSED: temporarily stopped by organiser; DISABLED: admin-forced off; ENDED: past end date or closed.
export enum CampaignStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
  ENDED = 'ENDED',
}

// Moderation outcome for a design or asset (e.g. user-uploaded art).
export enum ModerationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FLAGGED = 'FLAGGED',
}

// Polymorphic subject for an immutable moderation decision (TTW-027).
export enum ModerationSubjectType {
  DESIGN = 'DESIGN',
  MEDIA = 'MEDIA',
  CAMPAIGN = 'CAMPAIGN',
}

// Who produced a moderation decision.
export enum ModerationActorKind {
  AI = 'AI',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
  APPEAL_RESOLUTION = 'APPEAL_RESOLUTION',
}

// Owner appeal lifecycle for a challenged moderation decision.
export enum ModerationAppealStatus {
  PENDING = 'PENDING',
  WITHDRAWN = 'WITHDRAWN',
  UPHELD = 'UPHELD',
  OVERTURNED = 'OVERTURNED',
  ESCALATED = 'ESCALATED',
}

// TTW-030 organiser onboarding application lifecycle.
export enum OrganizerApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

// Lifecycle status for a media asset ingestion job.
export enum MediaAssetStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

// Where a media asset originated from.
export enum MediaSourceType {
  UPLOAD = 'UPLOAD',
  IMPORT_URL = 'IMPORT_URL',
}

// Derivative type for a media asset.
export enum MediaDerivativeType {
  ORIGINAL = 'ORIGINAL',
  DISPLAY = 'DISPLAY',
  THUMB = 'THUMB',
}

// Virus scan status for media assets.
export enum VirusScanStatus {
  PENDING = 'PENDING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  FAILED = 'FAILED',
}

// Payment or payout provider (v1: Paystack only).
export enum PaymentProvider {
  PAYSTACK = 'PAYSTACK',
}

// How a discount value is applied (percentage, fixed amount, or bulk tier).
export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
  BULK = 'BULK',
}

// Scope of a discount (order, product, variant, or campaign).
export enum DiscountScope {
  ORDER = 'ORDER',
  PRODUCT = 'PRODUCT',
  VARIANT = 'VARIANT',
  CAMPAIGN = 'CAMPAIGN',
}

// Whether a discount is currently active or inactive.
export enum DiscountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

// Visibility/lifecycle status of a product in the catalog.
export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

// Supported currency (v1: NGN only).
export enum CurrencyCode {
  NGN = 'NGN',
}

// Where an address was sourced from before normalization.
export enum AddressProvider {
  MANUAL = 'MANUAL',
  GOOGLE_PLACES = 'GOOGLE_PLACES',
  OTHER = 'OTHER',
}

// Generic strategy used to match an address or destination to a shipping zone.
export enum ShippingRuleMatchType {
  ADMIN1 = 'ADMIN1',
  ADMIN2 = 'ADMIN2',
  CITY = 'CITY',
  POSTAL_CODE = 'POSTAL_CODE',
  POSTAL_PREFIX = 'POSTAL_PREFIX',
}

// Provider used to quote a shipping rate.
export enum ShippingRateProvider {
  INTERNAL = 'INTERNAL',
}

// Channel used to send a notification (email, SMS, or Slack).
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  SLACK = 'SLACK',
}

// Delivery status of a notification outbox item.
export enum NotificationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

// Type of admin or system action recorded in the audit log.
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  FLAG = 'FLAG',
  DISABLE = 'DISABLE',
  ENABLE = 'ENABLE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  REFUND = 'REFUND',
  PAYOUT = 'PAYOUT',
}

// Result of a security-sensitive or administrative action.
export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  DENIED = 'DENIED',
}

// Origin of an audit event.
export enum AuditSource {
  PUBLIC_API = 'PUBLIC_API',
  ADMIN_API = 'ADMIN_API',
  WEBHOOK = 'WEBHOOK',
  WORKER = 'WORKER',
  CRON = 'CRON',
  SYSTEM = 'SYSTEM',
}

// Status of a payout to an organizer or recipient.
export enum PayoutStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  INITIATED = 'INITIATED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
  CANCELLED = 'CANCELLED',
}

// Type of entry in the campaign balance ledger (source of truth for eligible payout).
export enum LedgerEntryType {
  PAYMENT_SETTLED = 'PAYMENT_SETTLED',
  REFUND_APPLIED = 'REFUND_APPLIED',
  PAYOUT_RESERVED = 'PAYOUT_RESERVED',
  PAYOUT_SUCCEEDED = 'PAYOUT_SUCCEEDED',
  PAYOUT_FAILED = 'PAYOUT_FAILED',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
}

// Payout automation mode: manual-only, batch with approval, or fully automatic.
export enum PayoutMode {
  MANUAL = 'MANUAL',
  AUTO_APPROVAL_REQUIRED = 'AUTO_APPROVAL_REQUIRED',
  AUTO_EXECUTE = 'AUTO_EXECUTE',
}

// Status of a payout run (batch).
export enum PayoutRunStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// Financial/campaign/ledger effects apply only on SUCCEEDED after provider confirmation.
export enum RefundStatus {
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  NEEDS_ATTENTION = 'NEEDS_ATTENTION',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

// Auditable inventory counter effect (TTW-014). Each tracked order line follows reserve→release or reserve→consume exactly once.
export enum InventoryMovementKind {
  RESERVE = 'RESERVE',
  RELEASE = 'RELEASE',
  CONSUME = 'CONSUME',
}

// catalogue at backfill time (not historical evidence of what the buyer saw).
export enum OrderItemSnapshotSource {
  PURCHASE = 'PURCHASE',
  BACKFILLED_CURRENT_CATALOG = 'BACKFILLED_CURRENT_CATALOG',
}

// Type of layer in a workshop template (base, mask, outline, etc.).
export enum TemplateLayerType {
  BASE = 'BASE',
  SHADOW = 'SHADOW',
  HIGHLIGHT = 'HIGHLIGHT',
  MASK_OVERLAY = 'MASK_OVERLAY',
  OUTLINE = 'OUTLINE',
  DETAIL = 'DETAIL',
}

// Effect applied to a template layer when an option value is selected (e.g. TINT, REPLACE_IMAGE).
export enum TemplateEffectType {
  TINT = 'TINT',
  SHOW = 'SHOW',
  HIDE = 'HIDE',
  REPLACE_IMAGE = 'REPLACE_IMAGE',
}

// Blend mode for rendering a template layer over the product image.
export enum BlendMode {
  NORMAL = 'NORMAL',
  MULTIPLY = 'MULTIPLY',
  SCREEN = 'SCREEN',
  OVERLAY = 'OVERLAY',
  DARKEN = 'DARKEN',
  LIGHTEN = 'LIGHTEN',
}

// TTW-015 reconciliation run kind.
export enum ReconciliationRunKind {
  INTERNAL = 'INTERNAL',
  PROVIDER = 'PROVIDER',
  TARGETED = 'TARGETED',
}

export enum ReconciliationRunStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  INCOMPLETE = 'INCOMPLETE',
  FAILED = 'FAILED',
}

export enum ReconciliationDomain {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  PAYOUT = 'PAYOUT',
  CAMPAIGN = 'CAMPAIGN',
  INVENTORY = 'INVENTORY',
}

export enum ReconciliationOutcome {
  MATCHED = 'MATCHED',
  MISMATCH = 'MISMATCH',
  MISSING_INTERNAL = 'MISSING_INTERNAL',
  MISSING_PROVIDER = 'MISSING_PROVIDER',
  PENDING_GRACE = 'PENDING_GRACE',
  UNVERIFIABLE = 'UNVERIFIABLE',
}

export enum ReconciliationFindingStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  WONT_FIX = 'WONT_FIX',
}

export enum ReconciliationSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum ReconciliationRepairStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  APPLIED = 'APPLIED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}
