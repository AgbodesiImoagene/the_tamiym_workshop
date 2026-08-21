import {
  isSafeCustomerVisibleReason,
  sanitizeCustomerVisibleReason,
} from './organizer.constants';

describe('customerVisibleReason sanitization', () => {
  it('accepts plain customer-safe copy', () => {
    const text = 'Please provide a clearer intended use for your fundraiser.';
    expect(isSafeCustomerVisibleReason(text)).toBe(true);
    expect(sanitizeCustomerVisibleReason(text)).toBe(text);
  });

  it('rejects score-like and internal markers', () => {
    expect(isSafeCustomerVisibleReason('Score 0.91 is too high')).toBe(false);
    expect(
      isSafeCustomerVisibleReason('See internal notes for category: fraud'),
    ).toBe(false);
    expect(
      sanitizeCustomerVisibleReason('maxscore leaked').toLowerCase(),
    ).toMatch(/not approved|reapply/);
  });
});
