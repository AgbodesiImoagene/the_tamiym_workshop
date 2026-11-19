import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAddressDto } from './create-address.dto';
import { UpdateAddressDto } from './update-address.dto';

/**
 * TTW-226: the text fields of an address have a length limit and refuse a NUL
 * character (U+0000), which Postgres cannot store, with a 400 instead of a 500.
 */
const base = { addressLine1: '1 Allen Avenue', city: 'Ikeja', state: 'Lagos' };

const LIMITS: Array<[string, number]> = [
  ['addressLine1', 500],
  ['addressLine2', 500],
  ['landmark', 500],
  ['formattedAddress', 500],
  ['instructions', 500],
  ['recipientName', 200],
  ['city', 200],
  ['state', 200],
  ['country', 200],
  ['locality', 200],
  ['dependentLocality', 200],
  ['administrativeAreaLevel1', 200],
  ['administrativeAreaLevel2', 200],
  ['postalCode', 20],
  ['stateCode', 10],
  ['lgaId', 64],
  ['googlePlaceId', 300],
];

describe.each([
  ['CreateAddressDto', CreateAddressDto],
  ['UpdateAddressDto', UpdateAddressDto],
])('%s text fields', (_name, cls) => {
  const errorsFor = async (field: string, value: unknown) => {
    const dto = plainToInstance(cls as new () => object, {
      ...base,
      [field]: value,
    });
    return (await validate(dto)).filter((e) => e.property === field);
  };

  it.each(LIMITS)('%s accepts exactly %i characters', async (field, max) => {
    expect(await errorsFor(field, 'a'.repeat(max))).toHaveLength(0);
  });

  it.each(LIMITS)('%s refuses more than %i characters', async (field, max) => {
    expect(await errorsFor(field, 'a'.repeat(max + 1))).toHaveLength(1);
  });

  it.each(LIMITS.map(([field]) => [field]))(
    '%s refuses a NUL character',
    async (field) => {
      expect(await errorsFor(field, 'Lag\u0000os')).toHaveLength(1);
    },
  );

  it.each(['state', 'city', 'addressLine1'])(
    '%s still refuses an empty value',
    async (field) => {
      expect(await errorsFor(field, '')).toHaveLength(1);
    },
  );

  it('accepts ordinary values the forms send today', async () => {
    const dto = plainToInstance(cls as new () => object, {
      ...base,
      addressLine2: 'Apt 4B',
      landmark: "Near St. Mary's — opposite the bank",
      postalCode: '100001',
      instructions: 'Leave at gate\nCall me',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
