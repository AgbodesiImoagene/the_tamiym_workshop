import {
  resolveOutboxMail,
  OUTBOX_EVENT_ORDER_PLACED,
  OUTBOX_EVENT_PAYMENT_CONFIRMED,
  OUTBOX_EVENT_ADMIN_BROADCAST,
  OUTBOX_EVENT_ORDER_PROCESSING,
  OUTBOX_EVENT_ORDER_FULFILLED,
  OUTBOX_EVENT_ORDER_DELIVERED,
  OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER,
  OUTBOX_EVENT_REFUND_COMPLETED,
  OUTBOX_EVENT_DESIGN_MODERATION_APPROVED,
  OUTBOX_EVENT_DESIGN_MODERATION_REJECTED,
  OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED,
  OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED,
  OUTBOX_EVENT_ADMIN_OPERATIONAL,
} from './mail-outbox-templates';

describe('resolveOutboxMail', () => {
  it('maps OrderPlaced', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ORDER_PLACED, {
      orderId: 'ord_1',
      totalAmount: 99.5,
      currency: 'NGN',
    });
    expect(r).toEqual({
      template: 'order-placed',
      subject: 'New order placed',
      context: { orderId: 'ord_1', totalAmount: 99.5, currency: 'NGN' },
    });
  });

  it('maps PaymentConfirmed', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_PAYMENT_CONFIRMED, {
      orderId: 'ord_2',
      amount: 1200,
      currency: 'NGN',
      reference: 'PSK_abc',
    });
    expect(r).toEqual({
      template: 'payment-confirmed',
      subject: 'Payment confirmed — thank you',
      context: {
        orderId: 'ord_2',
        amount: 1200,
        currency: 'NGN',
        reference: 'PSK_abc',
      },
    });
  });

  it('maps AdminBroadcast', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ADMIN_BROADCAST, {
      subject: 'Hello',
      bodyHtml: '<p>Test</p>',
      firstName: 'Ada',
    });
    expect(r).toMatchObject({
      template: 'admin-broadcast',
      subject: 'Hello',
      context: expect.objectContaining({
        bodyHtml: '<p>Test</p>',
        firstName: 'Ada',
        subject: 'Hello',
      }),
    });
  });

  it('truncates AdminBroadcast subjects to 200 characters', () => {
    const long = 'x'.repeat(250);
    const r = resolveOutboxMail(OUTBOX_EVENT_ADMIN_BROADCAST, {
      subject: long,
      bodyHtml: '',
    });
    expect(r?.subject).toHaveLength(200);
  });

  it('maps OrderProcessing', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ORDER_PROCESSING, {
      orderId: 'ord_x',
      firstName: 'Sam',
    });
    expect(r).toMatchObject({
      template: 'order-processing',
      context: { orderId: 'ord_x', firstName: 'Sam' },
    });
  });

  it('maps OrderFulfilled', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ORDER_FULFILLED, {
      orderId: 'ord_ship',
      firstName: 'Sam',
    });
    expect(r).toMatchObject({
      template: 'order-fulfilled',
      context: { orderId: 'ord_ship', firstName: 'Sam' },
    });
  });

  it('maps OrderDelivered', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ORDER_DELIVERED, {
      orderId: 'ord_del',
      firstName: 'Sam',
    });
    expect(r).toMatchObject({
      template: 'order-delivered',
      context: { orderId: 'ord_del', firstName: 'Sam' },
    });
  });

  it('maps OrderCancelledCustomer', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER, {
      orderId: 'ord_c',
      firstName: 'Sam',
    });
    expect(r).toMatchObject({
      template: 'order-cancelled-customer',
      context: { orderId: 'ord_c', firstName: 'Sam' },
    });
  });

  it('maps RefundCompleted', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_REFUND_COMPLETED, {
      orderId: 'ord_r',
      amount: 50,
      currency: 'NGN',
      reason: 'duplicate',
      firstName: 'Lee',
    });
    expect(r?.template).toBe('refund-completed');
    expect(r?.context).toMatchObject({
      orderId: 'ord_r',
      amount: 50,
      currency: 'NGN',
      reason: 'duplicate',
      firstName: 'Lee',
    });
  });

  it('maps DesignModerationApproved', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_DESIGN_MODERATION_APPROVED, {
      designId: 'd1',
      designName: 'Camp tee',
      productName: 'Tee',
      firstName: 'Ada',
    });
    expect(r?.template).toBe('design-moderation-approved');
    expect(r?.context).toMatchObject({
      designId: 'd1',
      designName: 'Camp tee',
      productName: 'Tee',
      firstName: 'Ada',
    });
  });

  it('maps DesignModerationRejected', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_DESIGN_MODERATION_REJECTED, {
      designId: 'd2',
      designName: 'Camp tee',
      productName: 'Tee',
      firstName: 'Ada',
    });
    expect(r?.template).toBe('design-moderation-rejected');
    expect(r?.context).toMatchObject({
      designId: 'd2',
      designName: 'Camp tee',
      productName: 'Tee',
      firstName: 'Ada',
    });
  });

  it('maps OrganizerPayoutSucceeded', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED, {
      payoutId: 'po_1',
      amount: 1000,
      currency: 'NGN',
      campaignTitle: 'Camp',
      firstName: 'Org',
    });
    expect(r?.template).toBe('organizer-payout-succeeded');
    expect(r?.context).toMatchObject({
      payoutId: 'po_1',
      amount: 1000,
      currency: 'NGN',
      campaignTitle: 'Camp',
      firstName: 'Org',
    });
  });

  it('maps OrganizerPayoutFailed', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED, {
      payoutId: 'po_2',
      amount: 1000,
      currency: 'NGN',
      campaignTitle: 'Camp',
      firstName: 'Org',
      failureReason: 'bank_reject',
    });
    expect(r?.template).toBe('organizer-payout-failed');
    expect(r?.context).toMatchObject({
      payoutId: 'po_2',
      failureReason: 'bank_reject',
    });
  });

  it('maps AdminOperational', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ADMIN_OPERATIONAL, {
      subject: 'Ops alert',
      html: '<p>Details</p>',
    });
    expect(r).toEqual({
      template: 'admin-operational',
      subject: 'Ops alert',
      context: { subject: 'Ops alert', bodyHtml: '<p>Details</p>' },
    });
  });

  it('coerces non-scalar payload fields without stringifying objects', () => {
    const r = resolveOutboxMail(OUTBOX_EVENT_ADMIN_BROADCAST, {
      subject: { bad: true },
      bodyHtml: 12,
      firstName: false,
    });
    expect(r).toMatchObject({
      subject: 'Message from Tamiym',
      context: {
        bodyHtml: '12',
        firstName: 'false',
        subject: 'Message from Tamiym',
      },
    });
  });

  it('returns null for unknown events', () => {
    expect(resolveOutboxMail('Unknown', {})).toBeNull();
  });
});
