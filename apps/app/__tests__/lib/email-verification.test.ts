/**
 * TTW-090: the API refuses an order from an unverified account with the stable
 * code EMAIL_NOT_VERIFIED. The app recognises it to explain what to do.
 */
import {
  EMAIL_NOT_VERIFIED,
  EMAIL_NOT_VERIFIED_CHECKOUT_MESSAGE,
  EMAIL_NOT_VERIFIED_MESSAGE,
  isEmailNotVerified,
} from '@/lib/email-verification';

describe('isEmailNotVerified', () => {
  it('recognises the API code', () => {
    expect(isEmailNotVerified({ code: EMAIL_NOT_VERIFIED, statusCode: 403, message: 'x' })).toBe(
      true
    );
  });

  it('ignores other codes, plain errors and non-objects', () => {
    expect(isEmailNotVerified({ code: 'SHIPPING_ADDRESS_NOT_COVERED', message: 'x' })).toBe(false);
    expect(isEmailNotVerified(new Error('boom'))).toBe(false);
    expect(isEmailNotVerified(null)).toBe(false);
    expect(isEmailNotVerified('EMAIL_NOT_VERIFIED')).toBe(false);
  });

  it('explains in English that verification is required before ordering', () => {
    expect(EMAIL_NOT_VERIFIED_MESSAGE).toMatch(/verify your email/i);
    expect(EMAIL_NOT_VERIFIED_MESSAGE).toMatch(/order/i);
  });

  it('words the checkout refusal differently from the banner, so the page never repeats itself', () => {
    expect(EMAIL_NOT_VERIFIED_CHECKOUT_MESSAGE).toMatch(/not (been )?placed/i);
    expect(EMAIL_NOT_VERIFIED_CHECKOUT_MESSAGE).not.toBe(EMAIL_NOT_VERIFIED_MESSAGE);
  });
});
