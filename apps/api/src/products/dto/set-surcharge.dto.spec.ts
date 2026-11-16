import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetSurchargeDto } from './set-surcharge.dto';

async function errorsFor(amount: unknown) {
  return validate(plainToInstance(SetSurchargeDto, { amount }));
}

describe('SetSurchargeDto (TTW-094)', () => {
  it.each([0, 500, 1000.5, 99999999.99])('accepts %p', async (amount) => {
    expect(await errorsFor(amount)).toHaveLength(0);
  });

  it.each([
    ['negative', -1],
    ['more than two decimals', 10.123],
    ['above Decimal(10,2)', 100000000],
    ['not a number', 'abc'],
    ['missing', undefined],
    ['null', null],
    ['infinite', Infinity],
    ['tiny, written in exponent form', 1e-7],
    ['float drift', 0.1 + 0.2],
  ])('rejects %s', async (_label, amount) => {
    expect((await errorsFor(amount)).length).toBeGreaterThan(0);
  });
});
