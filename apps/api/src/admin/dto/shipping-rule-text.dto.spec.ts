import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateShippingRuleDto } from './create-shipping-rule.dto';
import { UpdateShippingRuleDto } from './update-shipping-rule.dto';

/** TTW-226: rule texts refuse a NUL character and over-long values with 400. */
const base = { countryCode: 'NG', matchType: 'ADMIN1', matchValue: 'LA' };

describe.each([
  ['CreateShippingRuleDto', CreateShippingRuleDto],
  ['UpdateShippingRuleDto', UpdateShippingRuleDto],
])('%s texts', (_n, cls) => {
  const errors = async (field: string, value: unknown) =>
    (
      await validate(
        plainToInstance(cls as new () => object, { ...base, [field]: value }),
      )
    ).filter((e) => e.property === field);

  it.each(['matchValue', 'matchContext'])('%s refuses a NUL', async (f) => {
    expect(await errors(f, 'a\u0000b')).toHaveLength(1);
  });
  it.each(['matchValue', 'matchContext'])('%s limits its length', async (f) => {
    expect(await errors(f, 'a'.repeat(200))).toHaveLength(0);
    expect(await errors(f, 'a'.repeat(201))).toHaveLength(1);
  });
  it('matchContext still accepts null', async () => {
    expect(await errors('matchContext', null)).toHaveLength(0);
  });
});
