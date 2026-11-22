import Handlebars from 'handlebars';
import { ADMIN_NOTIFICATION_DEFAULTS } from './admin-notification-defaults';
import {
  ADMIN_NOTIFICATION_EVENT_CATALOG,
  ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER,
} from './admin-notification-events';

describe('admin notification defaults', () => {
  it.each(ADMIN_NOTIFICATION_EVENT_CATALOG.map((e) => [e.key]))(
    'has built-in templates for %s (AdminNotifyService sends nothing without them)',
    (key) => {
      expect(ADMIN_NOTIFICATION_DEFAULTS[key]).toBeDefined();
    },
  );

  describe(ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER, () => {
    const render = (tpl: string, ctx: Record<string, unknown>) =>
      Handlebars.compile(tpl)(ctx);
    const defaults = () =>
      ADMIN_NOTIFICATION_DEFAULTS[ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER];

    it('names the problem payment, not a cancelled order, and shows the reason', () => {
      const ctx = {
        orderId: 'order-1',
        reference: 'ref-9',
        reason: 'The order was NOT marked paid (amount or currency missing)',
      };
      const subject = render(defaults().subject, ctx);
      expect(subject).toContain('order-1');
      expect(subject).not.toMatch(/cancelled/i);
      const body = render(defaults().emailBody, ctx);
      expect(body).toContain('ref-9');
      expect(body).toContain('amount or currency missing');
      expect(render(defaults().smsBody, ctx)).toContain('order-1');
    });

    it('renders when Paystack sent no amount or currency', () => {
      const body = render(defaults().emailBody, {
        orderId: 'order-1',
        reference: 'ref-9',
        reason: 'r',
      });
      expect(body).not.toMatch(/undefined|NaN/);
    });
  });
});
