import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAddressDto } from './create-address.dto';
import { UpdateAddressDto } from './update-address.dto';

/** TTW-198: delivery instructions are optional, plain text, at most 500 characters. */
const base = {
  addressLine1: '1 Allen Avenue',
  city: 'Ikeja',
  state: 'Lagos',
};

async function instructionErrors(
  cls: typeof CreateAddressDto | typeof UpdateAddressDto,
  instructions: unknown,
) {
  const dto = plainToInstance(cls as new () => object, {
    ...base,
    instructions,
  });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'instructions');
}

describe.each([
  ['CreateAddressDto', CreateAddressDto],
  ['UpdateAddressDto', UpdateAddressDto],
])('%s instructions', (_name, cls) => {
  it('accepts exactly 500 characters', async () => {
    expect(await instructionErrors(cls, 'a'.repeat(500))).toHaveLength(0);
  });

  it('refuses 501 characters', async () => {
    const errors = await instructionErrors(cls, 'a'.repeat(501));
    expect(errors).toHaveLength(1);
    expect(Object.keys(errors[0].constraints ?? {})).toContain('maxLength');
  });

  it('accepts null so the customer can remove saved instructions', async () => {
    expect(await instructionErrors(cls, null)).toHaveLength(0);
  });

  it('accepts a missing value', async () => {
    expect(await instructionErrors(cls, undefined)).toHaveLength(0);
  });
});
