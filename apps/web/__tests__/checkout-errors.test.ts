/**
 * TTW-086: the fundraiser checkout recognises the API refusal of an address
 * outside every shipping zone by its stable code, not by the server wording.
 */
import {
  SHIPPING_ADDRESS_NOT_COVERED,
  SHIPPING_NOT_COVERED_MESSAGE,
  isShippingNotCovered,
} from '../lib/checkout-errors';

describe('isShippingNotCovered', () => {
  it('matches the stable code from the API', () => {
    expect(
      isShippingNotCovered({ statusCode: 400, code: SHIPPING_ADDRESS_NOT_COVERED, message: 'x' })
    ).toBe(true);
  });

  it('ignores other errors and non-objects', () => {
    expect(isShippingNotCovered({ code: 'EMAIL_NOT_VERIFIED', message: 'x' })).toBe(false);
    expect(isShippingNotCovered({ message: "We don't deliver to this address yet" })).toBe(false);
    expect(isShippingNotCovered(null)).toBe(false);
    expect(isShippingNotCovered('SHIPPING_ADDRESS_NOT_COVERED')).toBe(false);
  });

  it('tells the customer what to do and that the cart is kept', () => {
    expect(SHIPPING_NOT_COVERED_MESSAGE).toMatch(/We don't deliver to this address yet/);
    expect(SHIPPING_NOT_COVERED_MESSAGE).toMatch(/cart is saved/);
  });
});
