import { ConflictException } from '@nestjs/common';

/**
 * TTW-227: an address that an order points to cannot be deleted (the order
 * keeps a foreign key to it). The database refuses; the customer gets this
 * clear answer instead of a 500.
 */
export const ADDRESS_IN_USE = 'ADDRESS_IN_USE';
export const ADDRESS_IN_USE_MESSAGE =
  'This address is used by an order and cannot be deleted.';

export function addressInUse(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: ADDRESS_IN_USE,
    message: ADDRESS_IN_USE_MESSAGE,
  });
}
