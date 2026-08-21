import { resolveCampaignLinePrice } from './campaign-line-price';

describe('resolveCampaignLinePrice', () => {
  it('sums campaign base and option upcharges with minor-unit rounding', () => {
    const result = resolveCampaignLinePrice(5000, 250.126, 'NGN');
    expect(result.unitBasePrice).toBe(5000);
    expect(result.optionValueUpcharge).toBe(250.13);
    expect(result.unitBeforeDiscount).toBe(5250.13);
  });

  it('treats zero upcharge as base-only display price', () => {
    expect(resolveCampaignLinePrice(4200, 0, 'NGN').unitBeforeDiscount).toBe(
      4200,
    );
  });
});
