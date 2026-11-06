import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BULK_TIER_MAX_QUANTITY,
  CreateBulkPricingDto,
} from './create-bulk-pricing.dto';
import { UpdateBulkPricingDto } from './update-bulk-pricing.dto';

describe('bulk pricing quantity limit', () => {
  const tier = {
    productId: 'product-1',
    currency: 'NGN',
    minQuantity: 1,
    maxQuantity: 10,
    pricePerUnit: 1000,
  };

  async function errorsFor<T extends object>(
    dto: new () => T,
    body: Record<string, unknown>,
  ) {
    const errors = await validate(plainToInstance(dto, body));
    return errors.flatMap((error) => Object.values(error.constraints ?? {}));
  }

  it('is the largest integer minus one', () => {
    expect(BULK_TIER_MAX_QUANTITY).toBe(2 ** 31 - 2);
  });

  it.each(['minQuantity', 'maxQuantity'])(
    'accepts %s at the limit',
    async (field) => {
      await expect(
        errorsFor(CreateBulkPricingDto, {
          ...tier,
          maxQuantity: BULK_TIER_MAX_QUANTITY,
          [field]: BULK_TIER_MAX_QUANTITY,
        }),
      ).resolves.toEqual([]);
      await expect(
        errorsFor(UpdateBulkPricingDto, { [field]: BULK_TIER_MAX_QUANTITY }),
      ).resolves.toEqual([]);
    },
  );

  it.each(['minQuantity', 'maxQuantity'])(
    'rejects %s just above the limit on create and update',
    async (field) => {
      const message = `${field} must be 2147483646 or less.`;

      await expect(
        errorsFor(CreateBulkPricingDto, {
          ...tier,
          [field]: BULK_TIER_MAX_QUANTITY + 1,
        }),
      ).resolves.toEqual([message]);
      await expect(
        errorsFor(UpdateBulkPricingDto, {
          [field]: BULK_TIER_MAX_QUANTITY + 1,
        }),
      ).resolves.toEqual([message]);
    },
  );

  it('still allows a tier with no maximum', async () => {
    await expect(
      errorsFor(CreateBulkPricingDto, { ...tier, maxQuantity: undefined }),
    ).resolves.toEqual([]);
  });
});
