import {
  resolveOutboxMail,
  OUTBOX_EVENT_ORDER_PLACED,
  OUTBOX_EVENT_PAYMENT_CONFIRMED,
  OUTBOX_EVENT_ADMIN_BROADCAST,
  OUTBOX_EVENT_ORDER_PROCESSING,
  OUTBOX_EVENT_REFUND_COMPLETED,
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

  it('returns null for unknown events', () => {
    expect(resolveOutboxMail('Unknown', {})).toBeNull();
  });
});
