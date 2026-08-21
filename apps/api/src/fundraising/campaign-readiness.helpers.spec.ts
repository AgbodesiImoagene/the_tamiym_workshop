import {
  isVariantSellable,
  issue,
  readinessBadRequest,
  emptyReadinessResult,
} from './campaign-readiness.helpers';
import {
  CampaignReadinessCode,
  CampaignReadinessPhase,
  CAMPAIGN_READINESS_POLICY_VERSION,
} from './campaign-readiness.constants';
import { BadRequestException } from '@nestjs/common';

describe('campaign-readiness.helpers', () => {
  it('isVariantSellable respects isAvailable and tracked stock', () => {
    expect(
      isVariantSellable({
        isAvailable: false,
        inventory: { trackInventory: true, stockOnHand: 5, reserved: 0 },
      }),
    ).toBe(false);
    expect(
      isVariantSellable({
        isAvailable: true,
        inventory: null,
      }),
    ).toBe(true);
    expect(
      isVariantSellable({
        isAvailable: true,
        inventory: { trackInventory: false, stockOnHand: 0, reserved: 0 },
      }),
    ).toBe(true);
    expect(
      isVariantSellable({
        isAvailable: true,
        inventory: { trackInventory: true, stockOnHand: 2, reserved: 2 },
      }),
    ).toBe(false);
    expect(
      isVariantSellable({
        isAvailable: true,
        inventory: { trackInventory: true, stockOnHand: 3, reserved: 1 },
      }),
    ).toBe(true);
  });

  it('readinessBadRequest includes stable codes and policy version', () => {
    const result = emptyReadinessResult(CampaignReadinessPhase.SUBMIT, 2, null);
    result.ready = false;
    result.blockers.push(
      issue(
        CampaignReadinessCode.TITLE_MISSING,
        'Add a campaign title before continuing.',
      ),
    );
    try {
      throw readinessBadRequest(result);
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe(CampaignReadinessCode.TITLE_MISSING);
      expect(body.readinessPolicyVersion).toBe(
        CAMPAIGN_READINESS_POLICY_VERSION,
      );
      expect(body.draftRevision).toBe(2);
    }
  });
});
