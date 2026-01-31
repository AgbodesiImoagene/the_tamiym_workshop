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

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ORGANIZER = 'ORGANIZER',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

export enum ImageRole {
  THUMBNAIL = 'THUMBNAIL',
  GALLERY = 'GALLERY',
  WORKSHOP_TEMPLATE = 'WORKSHOP_TEMPLATE',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  FULFILLED = 'FULFILLED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  INITIATED = 'INITIATED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
  ENDED = 'ENDED',
}

export enum ModerationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FLAGGED = 'FLAGGED',
}

export enum PaymentProvider {
  PAYSTACK = 'PAYSTACK',
}

// Future: STRIPE, FLUTTERWAVE, PAYPAL
export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
  BULK = 'BULK',
}

export enum DiscountScope {
  ORDER = 'ORDER',
  PRODUCT = 'PRODUCT',
  VARIANT = 'VARIANT',
  CAMPAIGN = 'CAMPAIGN',
}

export enum DiscountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum CurrencyCode {
  NGN = 'NGN',
}

// Future: USD, EUR, GBP, etc.
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  SLACK = 'SLACK',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

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

export enum PayoutStatus {
  INITIATED = 'INITIATED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export enum RefundStatus {
  INITIATED = 'INITIATED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}
