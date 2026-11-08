import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSiteSettingsDto } from './update-site-settings.dto';

async function vatRateErrors(vatRate: unknown) {
  const dto = plainToInstance(UpdateSiteSettingsDto, { vatRate });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'vatRate');
}

describe('UpdateSiteSettingsDto vatRate (TTW-084)', () => {
  it.each([0, 0.075, 0.0755, 1])('accepts %p', async (vatRate) => {
    expect(await vatRateErrors(vatRate)).toHaveLength(0);
  });

  it.each([-0.01, 1.01])('rejects %p as out of range', async (vatRate) => {
    expect(await vatRateErrors(vatRate)).toHaveLength(1);
  });

  it('rejects a rate finer than the stored precision, which would round to 0%', async () => {
    // Decimal(5,4) would store 0.00004 as 0.0000.
    expect(await vatRateErrors(0.00004)).toHaveLength(1);
  });
});
