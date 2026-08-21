import { OrderStatus, ShipmentStatus } from '../generated/prisma/enums';
import {
  RESOLUTION_POLICY_VERSION,
  RESOLUTION_TIME_ZONE,
  RefundReasonCode,
  ResolutionCode,
  ReturnReasonCode,
  evaluateCancellationEligibility,
  evaluateRefundEligibility,
  evaluateRefundStatusGate,
  evaluateResolutionEligibility,
  evaluateReturnEligibility,
  evaluateShipmentExceptionRemedyGrant,
  isWithinCalendarDaysFrom,
  calendarDateInTimeZone,
} from './resolution-policy';

describe('resolution-policy (TTW-041)', () => {
  describe('evaluateCancellationEligibility', () => {
    it('allows unpaid cancel', () => {
      const d = evaluateCancellationEligibility({
        orderStatus: OrderStatus.PENDING_PAYMENT,
      });
      expect(d).toMatchObject({
        allowed: true,
        code: ResolutionCode.CANCEL_ALLOWED_UNPAID,
        policyVersion: RESOLUTION_POLICY_VERSION,
      });
    });

    it.each([
      [OrderStatus.PAID, ResolutionCode.CANCEL_NOT_ALLOWED_USE_REFUND],
      [OrderStatus.PROCESSING, ResolutionCode.CANCEL_NOT_ALLOWED_USE_REFUND],
      [
        OrderStatus.PARTIALLY_REFUNDED,
        ResolutionCode.CANCEL_NOT_ALLOWED_USE_REFUND,
      ],
      [
        OrderStatus.FULFILLED,
        ResolutionCode.CANCEL_NOT_ALLOWED_SHIPPED_OR_FULFILLED,
      ],
      [OrderStatus.DELIVERED, ResolutionCode.CANCEL_NOT_ALLOWED_DELIVERED],
      [OrderStatus.CANCELLED, ResolutionCode.CANCEL_NOT_ALLOWED_TERMINAL],
      [OrderStatus.REFUNDED, ResolutionCode.CANCEL_NOT_ALLOWED_TERMINAL],
    ] as const)('denies %s with %s', (status, code) => {
      const d = evaluateCancellationEligibility({ orderStatus: status });
      expect(d.allowed).toBe(false);
      expect(d.code).toBe(code);
    });
  });

  describe('evaluateRefundEligibility', () => {
    const base = {
      hasCustomizedLine: false,
      activeOutboundShipmentStatus: null as ShipmentStatus | null,
    };

    it('requires reasonCode', () => {
      const d = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.PAID,
        reasonCode: null,
      });
      expect(d.code).toBe(ResolutionCode.REFUND_NOT_ALLOWED_REASON_REQUIRED);
      expect(d.allowed).toBe(false);
    });

    it('rejects unknown reason', () => {
      const d = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.PAID,
        reasonCode: 'NOT_A_REAL_REASON',
      });
      expect(d.code).toBe(ResolutionCode.REFUND_NOT_ALLOWED_UNKNOWN_REASON);
    });

    it('denies unpaid', () => {
      const d = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.PENDING_PAYMENT,
        reasonCode: RefundReasonCode.ADMIN_GOODWILL,
      });
      expect(d.code).toBe(ResolutionCode.REFUND_NOT_ALLOWED_UNPAID);
    });

    it('allows CHANGE_OF_MIND on PAID non-custom', () => {
      const d = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.PAID,
        reasonCode: RefundReasonCode.CHANGE_OF_MIND,
      });
      expect(d).toMatchObject({
        allowed: true,
        code: ResolutionCode.REFUND_ALLOWED,
      });
    });

    it('denies CHANGE_OF_MIND on custom after production starts', () => {
      const d = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.PROCESSING,
        hasCustomizedLine: true,
        reasonCode: RefundReasonCode.CHANGE_OF_MIND,
      });
      expect(d.code).toBe(
        ResolutionCode.REFUND_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND,
      );
    });

    it('denies CHANGE_OF_MIND after fulfilment', () => {
      const d = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.FULFILLED,
        reasonCode: RefundReasonCode.CHANGE_OF_MIND,
      });
      expect(d.code).toBe(ResolutionCode.REFUND_NOT_ALLOWED_REASON_FOR_STATUS);
    });

    it('allows DEFECT on delivered', () => {
      const d = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.DELIVERED,
        reasonCode: RefundReasonCode.DEFECT_OR_NOT_AS_DESCRIBED,
      });
      expect(d.allowed).toBe(true);
      expect(d.code).toBe(ResolutionCode.REFUND_ALLOWED);
    });

    it('allows CARRIER_LOSS_OR_DAMAGE only post-dispatch', () => {
      const early = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.PAID,
        reasonCode: RefundReasonCode.CARRIER_LOSS_OR_DAMAGE,
      });
      expect(early.code).toBe(
        ResolutionCode.REFUND_NOT_ALLOWED_REASON_FOR_STATUS,
      );

      const late = evaluateRefundEligibility({
        ...base,
        orderStatus: OrderStatus.FULFILLED,
        reasonCode: RefundReasonCode.CARRIER_LOSS_OR_DAMAGE,
      });
      expect(late.allowed).toBe(true);
    });

    it('status gate matches refundable set', () => {
      expect(
        evaluateRefundStatusGate({ orderStatus: OrderStatus.PAID }).allowed,
      ).toBe(true);
      expect(
        evaluateRefundStatusGate({
          orderStatus: OrderStatus.PENDING_PAYMENT,
        }).allowed,
      ).toBe(false);
    });
  });

  describe('evaluateReturnEligibility', () => {
    const deliveredAt = new Date('2026-08-10T12:00:00.000Z');

    it('allows standard change-of-mind within window', () => {
      const d = evaluateReturnEligibility({
        orderStatus: OrderStatus.DELIVERED,
        hasCustomizedLine: false,
        activeOutboundShipmentStatus: ShipmentStatus.DELIVERED,
        deliveredAt,
        now: new Date('2026-08-14T12:00:00.000Z'),
        reasonCode: ReturnReasonCode.CHANGE_OF_MIND,
      });
      expect(d).toMatchObject({
        allowed: true,
        code: ResolutionCode.RETURN_ALLOWED_WITHIN_WINDOW,
      });
    });

    it('denies after Africa/Lagos calendar window', () => {
      // delivered 10 Aug Lagos calendar → deadline 17 Aug inclusive
      const d = evaluateReturnEligibility({
        orderStatus: OrderStatus.DELIVERED,
        hasCustomizedLine: false,
        activeOutboundShipmentStatus: ShipmentStatus.DELIVERED,
        deliveredAt,
        now: new Date('2026-08-18T00:00:00.000Z'),
        reasonCode: ReturnReasonCode.CHANGE_OF_MIND,
      });
      expect(d.code).toBe(ResolutionCode.RETURN_NOT_ALLOWED_WINDOW_EXPIRED);
    });

    it('uses calendar days not wall-clock hours', () => {
      // Delivered late on 10 Aug Lagos; ~6.1 days later still same calendar window.
      const lateDelivery = new Date('2026-08-10T22:30:00.000Z'); // 11 Aug 00:30 Lagos?
      // 22:30 UTC = 23:30 Lagos on Aug 10
      expect(calendarDateInTimeZone(lateDelivery, RESOLUTION_TIME_ZONE)).toBe(
        '2026-08-10',
      );
      expect(
        isWithinCalendarDaysFrom(
          lateDelivery,
          new Date('2026-08-17T22:00:00.000Z'),
          7,
          RESOLUTION_TIME_ZONE,
        ),
      ).toBe(true);
      expect(
        isWithinCalendarDaysFrom(
          lateDelivery,
          new Date('2026-08-18T00:00:00.000Z'),
          7,
          RESOLUTION_TIME_ZONE,
        ),
      ).toBe(false);
    });

    it('denies custom change-of-mind', () => {
      const d = evaluateReturnEligibility({
        orderStatus: OrderStatus.DELIVERED,
        hasCustomizedLine: true,
        activeOutboundShipmentStatus: ShipmentStatus.DELIVERED,
        deliveredAt,
        now: new Date('2026-08-12T12:00:00.000Z'),
        reasonCode: ReturnReasonCode.CHANGE_OF_MIND,
      });
      expect(d.code).toBe(
        ResolutionCode.RETURN_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND,
      );
    });

    it('denies when not delivered', () => {
      const d = evaluateReturnEligibility({
        orderStatus: OrderStatus.FULFILLED,
        hasCustomizedLine: false,
        activeOutboundShipmentStatus: ShipmentStatus.DISPATCHED,
        deliveredAt: null,
      });
      expect(d.code).toBe(ResolutionCode.RETURN_NOT_ALLOWED_NOT_DELIVERED);
    });
  });

  describe('TTW-040 shipment exception coupling', () => {
    it('never allows remedy solely from EXCEPTION', () => {
      const d = evaluateShipmentExceptionRemedyGrant({
        activeOutboundShipmentStatus: ShipmentStatus.EXCEPTION,
      });
      expect(d.allowed).toBe(false);
      expect(d.code).toBe(ResolutionCode.SHIPMENT_EXCEPTION_IS_NOT_REMEDY);
    });

    it('snapshot keeps exception separate from cancel/refund', () => {
      const snap = evaluateResolutionEligibility({
        orderStatus: OrderStatus.FULFILLED,
        hasCustomizedLine: false,
        activeOutboundShipmentStatus: ShipmentStatus.EXCEPTION,
      });
      expect(snap.cancellation.allowed).toBe(false);
      expect(snap.shipmentExceptionIsNotRemedy.allowed).toBe(false);
      expect(snap.shipmentExceptionIsNotRemedy.code).toBe(
        ResolutionCode.SHIPMENT_EXCEPTION_IS_NOT_REMEDY,
      );
      // Explicit admin refund with carrier reason remains separately evaluable
      const refund = evaluateRefundEligibility({
        orderStatus: OrderStatus.FULFILLED,
        hasCustomizedLine: false,
        activeOutboundShipmentStatus: ShipmentStatus.EXCEPTION,
        reasonCode: RefundReasonCode.CARRIER_LOSS_OR_DAMAGE,
      });
      expect(refund.allowed).toBe(true);
    });
  });
});
