import { BadRequestException } from '@nestjs/common';

/**
 * TTW-086: the address matches no active shipping zone, or the zone has no
 * active rate. The order is refused rather than shipped for ₦0 (client
 * answer Q22: "for now reject").
 */
export const SHIPPING_ADDRESS_NOT_COVERED = 'SHIPPING_ADDRESS_NOT_COVERED';

export const SHIPPING_ADDRESS_NOT_COVERED_MESSAGE =
  "We don't deliver to this address yet. Please check the state and LGA, or use another delivery address.";

export function shippingAddressNotCovered(
  message: string = SHIPPING_ADDRESS_NOT_COVERED_MESSAGE,
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: SHIPPING_ADDRESS_NOT_COVERED,
    message,
  });
}

/**
 * TTW-098: the zone's rate is charged by weight, but a product in the cart has
 * no weight. The quote is refused rather than guessed, so an order never ships
 * under-charged.
 */
export const SHIPPING_WEIGHT_UNKNOWN = 'SHIPPING_WEIGHT_UNKNOWN';

export const SHIPPING_WEIGHT_UNKNOWN_MESSAGE =
  'We cannot calculate delivery for one of these products yet. Please contact us to complete this order.';

export function shippingWeightUnknown(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: SHIPPING_WEIGHT_UNKNOWN,
    message: SHIPPING_WEIGHT_UNKNOWN_MESSAGE,
  });
}

/**
 * TTW-087: a Nigerian address names a state the platform does not know. It is
 * refused when saved, so a misspelled state never reaches a shipping quote.
 */
export const ADDRESS_STATE_UNKNOWN = 'ADDRESS_STATE_UNKNOWN';

export const ADDRESS_STATE_UNKNOWN_MESSAGE =
  'Choose a state from the list. We could not match the state you entered.';

export function addressStateUnknown(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: ADDRESS_STATE_UNKNOWN,
    message: ADDRESS_STATE_UNKNOWN_MESSAGE,
  });
}

/**
 * TTW-217: the saved address is in a state or LGA an admin deactivated after the
 * address was saved. It still loads (so the customer can edit it) but it is no
 * longer quoted or ordered. Orders that already exist are not affected.
 */
export const ADDRESS_STATE_NOT_DELIVERABLE = 'ADDRESS_STATE_NOT_DELIVERABLE';

export const ADDRESS_STATE_NOT_DELIVERABLE_MESSAGE =
  'We do not deliver to this area.';

export function addressStateNotDeliverable(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: ADDRESS_STATE_NOT_DELIVERABLE,
    message: ADDRESS_STATE_NOT_DELIVERABLE_MESSAGE,
  });
}

/**
 * TTW-216: an address has one state, identified by its code. A request whose
 * `stateCode` and state text name two different states is refused instead of
 * storing a pair that contradicts itself.
 */
export const ADDRESS_STATE_MISMATCH = 'ADDRESS_STATE_MISMATCH';

export const ADDRESS_STATE_MISMATCH_MESSAGE =
  'The state code and the state name you sent are two different states. Choose one state from the list.';

export function addressStateMismatch(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: ADDRESS_STATE_MISMATCH,
    message: ADDRESS_STATE_MISMATCH_MESSAGE,
  });
}

/**
 * TTW-219: the country code of an address must be a real ISO 3166-1 alpha-2
 * code. Anything else is refused, so a code written another way can never make
 * a Nigerian address skip the state checks.
 */
export const ADDRESS_COUNTRY_CODE_INVALID = 'ADDRESS_COUNTRY_CODE_INVALID';

export const ADDRESS_COUNTRY_CODE_INVALID_MESSAGE =
  'Choose a valid two-letter country code, for example NG.';

export function addressCountryCodeInvalid(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: ADDRESS_COUNTRY_CODE_INVALID,
    message: ADDRESS_COUNTRY_CODE_INVALID_MESSAGE,
  });
}

/**
 * TTW-221 (gap 1): a Nigerian address in a state that has active LGAs must name
 * one. Saving refuses an address without it, and a saved address that still has
 * none is not quoted or ordered until the customer chooses one. Without it, a
 * deactivated LGA could be skipped by leaving the LGA out.
 */
export const ADDRESS_LGA_REQUIRED = 'ADDRESS_LGA_REQUIRED';

export const ADDRESS_LGA_REQUIRED_MESSAGE =
  'Choose your LGA (local government area) from the list.';

export function addressLgaRequired(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: ADDRESS_LGA_REQUIRED,
    message: ADDRESS_LGA_REQUIRED_MESSAGE,
  });
}
