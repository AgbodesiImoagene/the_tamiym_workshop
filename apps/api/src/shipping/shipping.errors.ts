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
