/**
 * TTW-086: the fundraiser checkout recognises the API refusal of an address
 * outside every shipping zone by its stable code, not by the server wording.
 */
import {
  ADDRESS_LGA_REQUIRED_MESSAGE,
  ADDRESS_STATE_NOT_DELIVERABLE,
  ADDRESS_STATE_NOT_DELIVERABLE_MESSAGE,
  SHIPPING_ADDRESS_NOT_COVERED,
  SHIPPING_NOT_COVERED_MESSAGE,
  isAddressLgaRequired,
  isAddressStateNotDeliverable,
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

/** TTW-217: a state we no longer deliver to is recognised by its stable code. */
describe('isAddressStateNotDeliverable', () => {
  it('matches the stable code from the API', () => {
    expect(
      isAddressStateNotDeliverable({
        statusCode: 400,
        code: ADDRESS_STATE_NOT_DELIVERABLE,
        message: 'x',
      })
    ).toBe(true);
  });

  it('ignores other errors, the server wording and non-objects', () => {
    expect(isAddressStateNotDeliverable({ code: SHIPPING_ADDRESS_NOT_COVERED })).toBe(false);
    expect(isAddressStateNotDeliverable({ message: 'We do not deliver to this area.' })).toBe(
      false
    );
    expect(isAddressStateNotDeliverable(null)).toBe(false);
    expect(isAddressStateNotDeliverable('ADDRESS_STATE_NOT_DELIVERABLE')).toBe(false);
  });

  it('uses the owner wording', () => {
    expect(ADDRESS_STATE_NOT_DELIVERABLE_MESSAGE).toBe('We do not deliver to this area.');
  });
});

/** TTW-221: a missing LGA is recognised by its stable code. */
describe('isAddressLgaRequired', () => {
  it('matches the stable code and ignores other errors', () => {
    expect(
      isAddressLgaRequired({ statusCode: 400, code: 'ADDRESS_LGA_REQUIRED', message: 'x' })
    ).toBe(true);
    expect(isAddressLgaRequired({ code: 'ADDRESS_STATE_NOT_DELIVERABLE' })).toBe(false);
    expect(isAddressLgaRequired(null)).toBe(false);
  });

  it('tells the customer to choose an LGA and that the cart is kept', () => {
    expect(ADDRESS_LGA_REQUIRED_MESSAGE).toMatch(/Choose your LGA/);
    expect(ADDRESS_LGA_REQUIRED_MESSAGE).toMatch(/cart is saved/);
  });
});
