import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAddressDto } from './create-address.dto';
import { UpdateAddressDto } from './update-address.dto';

/** TTW-219: the country code is folded to a real ISO code or refused with 400. */
const base = { addressLine1: '1 Allen Avenue', city: 'Ikeja', state: 'Lagos' };

describe.each([
  ['CreateAddressDto', CreateAddressDto],
  ['UpdateAddressDto', UpdateAddressDto],
])('%s countryCode', (_name, cls) => {
  const run = async (countryCode: unknown) => {
    const dto = plainToInstance(cls as new () => { countryCode?: string }, {
      ...base,
      countryCode,
    });
    const errors = await validate(dto);
    return { dto, errors: errors.filter((e) => e.property === 'countryCode') };
  };

  it.each([
    ['NG', 'NG'],
    ['ng', 'NG'],
    ['ＮＧ', 'NG'],
    ['gh', 'GH'],
  ])('folds %j to %s', async (value, expected) => {
    const { dto, errors } = await run(value);
    expect(errors).toHaveLength(0);
    expect(dto.countryCode).toBe(expected);
  });

  it.each([
    [''],
    ['XX'],
    ['N1'],
    ['NGA'],
    ['  '],
    ['Ｎ'],
    ['\u0131t'],
    ['\u00DF'],
    [7],
  ])('refuses %j', async (value) => {
    const { errors } = await run(value);
    expect(errors).toHaveLength(1);
  });

  it('accepts an absent code', async () => {
    const { errors } = await run(undefined);
    expect(errors).toHaveLength(0);
  });
});
