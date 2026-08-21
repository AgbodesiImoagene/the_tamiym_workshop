/**
 * TTW-041 slice 1 — pure cancellation / refund / return eligibility evaluator.
 * Policy: docs/orders/ttw-041-interim-policy.md
 *
 * Server authority only. Clients must not invent eligibility.
 * Delivery exceptions (TTW-040) never silently grant cancel/refund/return/stock.
 */

import { OrderStatus, ShipmentStatus } from '../generated/prisma/enums';

export const RESOLUTION_POLICY_VERSION =
  'cancellation-refund-return/v1-interim-2026-08-21';

/** Calendar days after deliveredAt for automatic return eligibility. */
export const RETURN_WINDOW_CALENDAR_DAYS = 7;

/** Policy calendar for return-window boundaries (interim). */
export const RESOLUTION_TIME_ZONE = 'Africa/Lagos';

/**
 * YYYY-MM-DD calendar date in the given IANA time zone.
 */
export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Add whole calendar days to a YYYY-MM-DD string (UTC date arithmetic). */
export function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + days));
  return utc.toISOString().slice(0, 10);
}

/**
 * True when `now`'s calendar date (in `timeZone`) is on or before
 * `from`'s calendar date + `days` (inclusive end day).
 */
export function isWithinCalendarDaysFrom(
  from: Date,
  now: Date,
  days: number,
  timeZone: string = RESOLUTION_TIME_ZONE,
): boolean {
  const start = calendarDateInTimeZone(from, timeZone);
  const deadline = addCalendarDaysYmd(start, days);
  const today = calendarDateInTimeZone(now, timeZone);
  return today <= deadline;
}

export const RefundReasonCode = {
  CHANGE_OF_MIND: 'CHANGE_OF_MIND',
  DEFECT_OR_NOT_AS_DESCRIBED: 'DEFECT_OR_NOT_AS_DESCRIBED',
  PRODUCTION_FAILURE: 'PRODUCTION_FAILURE',
  CARRIER_LOSS_OR_DAMAGE: 'CARRIER_LOSS_OR_DAMAGE',
  ADDRESS_FAILURE_PLATFORM: 'ADDRESS_FAILURE_PLATFORM',
  DUPLICATE_OR_PRICING_ERROR: 'DUPLICATE_OR_PRICING_ERROR',
  ADMIN_GOODWILL: 'ADMIN_GOODWILL',
} as const;

export type RefundReasonCode =
  (typeof RefundReasonCode)[keyof typeof RefundReasonCode];

export const REFUND_REASON_CODES: readonly RefundReasonCode[] =
  Object.values(RefundReasonCode);

export const ReturnReasonCode = {
  CHANGE_OF_MIND: 'CHANGE_OF_MIND',
  DEFECT_OR_NOT_AS_DESCRIBED: 'DEFECT_OR_NOT_AS_DESCRIBED',
} as const;

export type ReturnReasonCode =
  (typeof ReturnReasonCode)[keyof typeof ReturnReasonCode];

export const ResolutionCode = {
  CANCEL_ALLOWED_UNPAID: 'CANCEL_ALLOWED_UNPAID',
  CANCEL_NOT_ALLOWED_USE_REFUND: 'CANCEL_NOT_ALLOWED_USE_REFUND',
  CANCEL_NOT_ALLOWED_SHIPPED_OR_FULFILLED:
    'CANCEL_NOT_ALLOWED_SHIPPED_OR_FULFILLED',
  CANCEL_NOT_ALLOWED_DELIVERED: 'CANCEL_NOT_ALLOWED_DELIVERED',
  CANCEL_NOT_ALLOWED_TERMINAL: 'CANCEL_NOT_ALLOWED_TERMINAL',

  REFUND_ALLOWED: 'REFUND_ALLOWED',
  REFUND_NOT_ALLOWED_UNPAID: 'REFUND_NOT_ALLOWED_UNPAID',
  REFUND_NOT_ALLOWED_TERMINAL: 'REFUND_NOT_ALLOWED_TERMINAL',
  REFUND_NOT_ALLOWED_UNKNOWN_REASON: 'REFUND_NOT_ALLOWED_UNKNOWN_REASON',
  REFUND_NOT_ALLOWED_REASON_FOR_STATUS: 'REFUND_NOT_ALLOWED_REASON_FOR_STATUS',
  REFUND_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND:
    'REFUND_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND',
  REFUND_NOT_ALLOWED_REASON_REQUIRED: 'REFUND_NOT_ALLOWED_REASON_REQUIRED',

  RETURN_ALLOWED_WITHIN_WINDOW: 'RETURN_ALLOWED_WITHIN_WINDOW',
  RETURN_NOT_ALLOWED_NOT_DELIVERED: 'RETURN_NOT_ALLOWED_NOT_DELIVERED',
  RETURN_NOT_ALLOWED_WINDOW_EXPIRED: 'RETURN_NOT_ALLOWED_WINDOW_EXPIRED',
  RETURN_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND:
    'RETURN_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND',
  RETURN_NOT_ALLOWED_UNKNOWN_REASON: 'RETURN_NOT_ALLOWED_UNKNOWN_REASON',

  /** TTW-040: exception is not itself a cancel/refund/return/stock grant. */
  SHIPMENT_EXCEPTION_IS_NOT_REMEDY: 'SHIPMENT_EXCEPTION_IS_NOT_REMEDY',
} as const;

export type ResolutionCode =
  (typeof ResolutionCode)[keyof typeof ResolutionCode];

export type ResolutionPolicyInput = {
  orderStatus: OrderStatus;
  /** True when any line has a designId (customized merchandise). */
  hasCustomizedLine: boolean;
  /** Active outbound shipment status, if any (not CANCELLED). */
  activeOutboundShipmentStatus?: ShipmentStatus | null;
  /** Shipment deliveredAt when known (return window). */
  deliveredAt?: Date | string | null;
  now?: Date;
};

export type EligibilityDecision = {
  allowed: boolean;
  code: ResolutionCode;
  policyVersion: string;
  message: string;
};

export type ResolutionEligibilitySnapshot = {
  policyVersion: string;
  cancellation: EligibilityDecision;
  /** Admin refund status gate (reason still required to initiate). */
  refund: EligibilityDecision;
  /**
   * Return request eligibility for CHANGE_OF_MIND (customer-facing default).
   * Defect returns use evaluateReturnEligibility with an explicit reason.
   */
  return: EligibilityDecision;
  /** Informational TTW-040 coupling: exceptions never auto-grant remedies. */
  shipmentExceptionIsNotRemedy: EligibilityDecision;
};

const REFUNDABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
  OrderStatus.PARTIALLY_REFUNDED,
]);

const PRE_FULFILMENT_REFUND_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
]);

const POST_DISPATCH_REFUND_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
  OrderStatus.PARTIALLY_REFUNDED,
]);

const PRODUCTION_STARTED_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
  OrderStatus.PARTIALLY_REFUNDED,
]);

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decision(
  allowed: boolean,
  code: ResolutionCode,
  message: string,
): EligibilityDecision {
  return {
    allowed,
    code,
    policyVersion: RESOLUTION_POLICY_VERSION,
    message,
  };
}

export function isRefundReasonCode(value: unknown): value is RefundReasonCode {
  return (
    typeof value === 'string' &&
    (REFUND_REASON_CODES as readonly string[]).includes(value)
  );
}

/**
 * Unpaid cancel only. Paid unwind must use refund (TTW-013), never silent stock restore.
 */
export function evaluateCancellationEligibility(
  input: Pick<ResolutionPolicyInput, 'orderStatus'>,
): EligibilityDecision {
  const { orderStatus } = input;

  if (orderStatus === OrderStatus.PENDING_PAYMENT) {
    return decision(
      true,
      ResolutionCode.CANCEL_ALLOWED_UNPAID,
      'Unpaid orders may be cancelled; reserved inventory is released.',
    );
  }

  if (
    orderStatus === OrderStatus.CANCELLED ||
    orderStatus === OrderStatus.REFUNDED
  ) {
    return decision(
      false,
      ResolutionCode.CANCEL_NOT_ALLOWED_TERMINAL,
      'Order is already in a terminal cancelled or refunded state.',
    );
  }

  if (orderStatus === OrderStatus.DELIVERED) {
    return decision(
      false,
      ResolutionCode.CANCEL_NOT_ALLOWED_DELIVERED,
      'Delivered orders cannot be cancelled; use return or refund policy paths.',
    );
  }

  if (orderStatus === OrderStatus.FULFILLED) {
    return decision(
      false,
      ResolutionCode.CANCEL_NOT_ALLOWED_SHIPPED_OR_FULFILLED,
      'Fulfilled or shipped orders cannot be cancelled; use the refund path.',
    );
  }

  // PAID, PROCESSING, PARTIALLY_REFUNDED
  return decision(
    false,
    ResolutionCode.CANCEL_NOT_ALLOWED_USE_REFUND,
    'Paid orders cannot be cancelled directly; initiate a policy-compliant refund.',
  );
}

/**
 * Admin refund initiation eligibility for a reason code.
 * Does not check amount caps (TTW-013) or move money.
 */
export function evaluateRefundEligibility(
  input: ResolutionPolicyInput & {
    reasonCode?: string | null;
  },
): EligibilityDecision {
  const { orderStatus, hasCustomizedLine, reasonCode } = input;

  if (orderStatus === OrderStatus.PENDING_PAYMENT) {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_UNPAID,
      'Unpaid orders are not refundable; cancel instead.',
    );
  }

  if (
    orderStatus === OrderStatus.CANCELLED ||
    orderStatus === OrderStatus.REFUNDED
  ) {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_TERMINAL,
      'Order is terminal and cannot receive a new refund.',
    );
  }

  if (!REFUNDABLE_STATUSES.has(orderStatus)) {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_TERMINAL,
      `Order status ${orderStatus} is not refundable.`,
    );
  }

  if (reasonCode == null || reasonCode === '') {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_REASON_REQUIRED,
      'A stable refund reasonCode is required.',
    );
  }

  if (!isRefundReasonCode(reasonCode)) {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_UNKNOWN_REASON,
      'Refund reasonCode is not in the interim policy vocabulary.',
    );
  }

  if (
    reasonCode === RefundReasonCode.CHANGE_OF_MIND &&
    hasCustomizedLine &&
    PRODUCTION_STARTED_STATUSES.has(orderStatus)
  ) {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND,
      'Customized goods are not refundable for change of mind after production starts.',
    );
  }

  if (reasonCode === RefundReasonCode.CHANGE_OF_MIND) {
    if (!PRE_FULFILMENT_REFUND_STATUSES.has(orderStatus)) {
      return decision(
        false,
        ResolutionCode.REFUND_NOT_ALLOWED_REASON_FOR_STATUS,
        'Change-of-mind refunds are only allowed before fulfilment.',
      );
    }
    return decision(
      true,
      ResolutionCode.REFUND_ALLOWED,
      'Refund is allowed under interim change-of-mind rules.',
    );
  }

  if (
    reasonCode === RefundReasonCode.CARRIER_LOSS_OR_DAMAGE ||
    reasonCode === RefundReasonCode.ADDRESS_FAILURE_PLATFORM
  ) {
    if (!POST_DISPATCH_REFUND_STATUSES.has(orderStatus)) {
      return decision(
        false,
        ResolutionCode.REFUND_NOT_ALLOWED_REASON_FOR_STATUS,
        'Carrier/address remedies require a fulfilled or delivered order.',
      );
    }
    return decision(
      true,
      ResolutionCode.REFUND_ALLOWED,
      'Refund is allowed for confirmed carrier or address platform fault.',
    );
  }

  // DEFECT, PRODUCTION_FAILURE, DUPLICATE_OR_PRICING_ERROR, ADMIN_GOODWILL
  return decision(
    true,
    ResolutionCode.REFUND_ALLOWED,
    'Refund is allowed under interim policy for this reason and status.',
  );
}

/**
 * Status-only refund gate (used when projecting eligibility without a reason).
 */
export function evaluateRefundStatusGate(
  input: Pick<ResolutionPolicyInput, 'orderStatus'>,
): EligibilityDecision {
  const { orderStatus } = input;
  if (orderStatus === OrderStatus.PENDING_PAYMENT) {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_UNPAID,
      'Unpaid orders are not refundable; cancel instead.',
    );
  }
  if (
    orderStatus === OrderStatus.CANCELLED ||
    orderStatus === OrderStatus.REFUNDED
  ) {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_TERMINAL,
      'Order is terminal and cannot receive a new refund.',
    );
  }
  if (!REFUNDABLE_STATUSES.has(orderStatus)) {
    return decision(
      false,
      ResolutionCode.REFUND_NOT_ALLOWED_TERMINAL,
      `Order status ${orderStatus} is not refundable.`,
    );
  }
  return decision(
    true,
    ResolutionCode.REFUND_ALLOWED,
    'Order status may accept a policy-compliant admin refund (reason required).',
  );
}

export function evaluateReturnEligibility(
  input: ResolutionPolicyInput & {
    reasonCode?: string | null;
  },
): EligibilityDecision {
  const reasonCode = input.reasonCode ?? ReturnReasonCode.CHANGE_OF_MIND;
  const now = input.now ?? new Date();

  if (
    reasonCode !== ReturnReasonCode.CHANGE_OF_MIND &&
    reasonCode !== ReturnReasonCode.DEFECT_OR_NOT_AS_DESCRIBED
  ) {
    return decision(
      false,
      ResolutionCode.RETURN_NOT_ALLOWED_UNKNOWN_REASON,
      'Return reasonCode is not in the interim policy vocabulary.',
    );
  }

  if (input.orderStatus !== OrderStatus.DELIVERED) {
    return decision(
      false,
      ResolutionCode.RETURN_NOT_ALLOWED_NOT_DELIVERED,
      'Returns are only considered after the order is delivered.',
    );
  }

  if (
    input.activeOutboundShipmentStatus != null &&
    input.activeOutboundShipmentStatus !== ShipmentStatus.DELIVERED
  ) {
    return decision(
      false,
      ResolutionCode.RETURN_NOT_ALLOWED_NOT_DELIVERED,
      'Returns require a delivered outbound shipment.',
    );
  }

  const delivered = asDate(input.deliveredAt);
  if (!delivered) {
    return decision(
      false,
      ResolutionCode.RETURN_NOT_ALLOWED_NOT_DELIVERED,
      'Return window cannot be evaluated without a delivery timestamp.',
    );
  }

  if (
    reasonCode === ReturnReasonCode.CHANGE_OF_MIND &&
    input.hasCustomizedLine
  ) {
    return decision(
      false,
      ResolutionCode.RETURN_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND,
      'Customized goods are not returnable for change of mind.',
    );
  }

  if (
    !isWithinCalendarDaysFrom(
      delivered,
      now,
      RETURN_WINDOW_CALENDAR_DAYS,
      RESOLUTION_TIME_ZONE,
    )
  ) {
    return decision(
      false,
      ResolutionCode.RETURN_NOT_ALLOWED_WINDOW_EXPIRED,
      `Return window of ${RETURN_WINDOW_CALENDAR_DAYS} calendar days (${RESOLUTION_TIME_ZONE}) has expired.`,
    );
  }

  return decision(
    true,
    ResolutionCode.RETURN_ALLOWED_WITHIN_WINDOW,
    'Return request would be in-policy under the interim window.',
  );
}

/**
 * TTW-040 coupling: shipment EXCEPTION never grants remedies by itself.
 */
export function evaluateShipmentExceptionRemedyGrant(
  input: Pick<ResolutionPolicyInput, 'activeOutboundShipmentStatus'>,
): EligibilityDecision {
  return decision(
    false,
    ResolutionCode.SHIPMENT_EXCEPTION_IS_NOT_REMEDY,
    input.activeOutboundShipmentStatus === ShipmentStatus.EXCEPTION
      ? 'Delivery exceptions do not grant cancel, refund, return, or stock restore.'
      : 'No shipment exception present; remedies still require explicit policy evaluation.',
  );
}

/** Full snapshot for order-detail / support projections. */
export function evaluateResolutionEligibility(
  input: ResolutionPolicyInput,
): ResolutionEligibilitySnapshot {
  return {
    policyVersion: RESOLUTION_POLICY_VERSION,
    cancellation: evaluateCancellationEligibility(input),
    refund: evaluateRefundStatusGate(input),
    return: evaluateReturnEligibility({
      ...input,
      reasonCode: ReturnReasonCode.CHANGE_OF_MIND,
    }),
    shipmentExceptionIsNotRemedy: evaluateShipmentExceptionRemedyGrant(input),
  };
}
