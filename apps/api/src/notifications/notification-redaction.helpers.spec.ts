import {
  maskEmailRecipient,
  maskNotificationRecipient,
  maskPhoneRecipient,
  classifyDeliveryError,
  redactAttemptErrorMessage,
  redactNotificationPayload,
} from './notification-redaction.helpers';
import { NotificationChannel } from '../generated/prisma/enums';

describe('notification-redaction.helpers', () => {
  it('masks email local part', () => {
    expect(maskEmailRecipient('alice@example.com')).toBe('a***@example.com');
  });

  it('masks phone numbers', () => {
    expect(maskPhoneRecipient('+2348012345678')).toContain('***');
  });

  it('masks slack webhook urls', () => {
    expect(
      maskNotificationRecipient(
        NotificationChannel.SLACK,
        'https://hooks.slack.com/services/T/B/X',
      ),
    ).toBe('https://hooks.slack.com/***');
  });

  it('classifies timeout errors', () => {
    expect(classifyDeliveryError('Provider timed out')).toBe(
      'provider_timeout',
    );
  });

  it('redacts emails from error messages', () => {
    expect(
      redactAttemptErrorMessage('Failed for alice@example.com after timeout'),
    ).not.toMatch(/alice@example.com/);
  });

  it('redacts notification payloads to safe keys only', () => {
    expect(
      redactNotificationPayload({
        orderId: 'o1',
        firstName: 'Alice',
        bodyHtml: '<p>secret</p>',
      }),
    ).toEqual({ redacted: true, orderId: 'o1' });
  });
});
