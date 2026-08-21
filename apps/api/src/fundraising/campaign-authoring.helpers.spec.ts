import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus } from '../generated/prisma/enums';
import { CampaignAuthoringErrorCode } from './campaign-authoring.constants';
import {
  assertCampaignFound,
  assertDraftMutable,
  assertOwned,
  authoringBadRequest,
  staleRevisionConflict,
  validateDateOrder,
  validateGoalAmount,
  validateOfferPrice,
  validateSlug,
  validateTitle,
  priceGuidancePayload,
} from './campaign-authoring.helpers';

describe('campaign-authoring.helpers', () => {
  it('assertCampaignFound throws NotFound', () => {
    expect(() => assertCampaignFound(null)).toThrow(NotFoundException);
  });

  it('assertOwned throws Forbidden', () => {
    expect(() => assertOwned('a', 'b')).toThrow(ForbiddenException);
  });

  it('assertDraftMutable rejects non-draft', () => {
    expect(() => assertDraftMutable(CampaignStatus.ACTIVE)).toThrow(
      BadRequestException,
    );
  });

  it('validateTitle / slug / goal / dates / price', () => {
    expect(() => validateTitle('  ')).toThrow(BadRequestException);
    expect(() => validateSlug('Bad Slug')).toThrow(BadRequestException);
    validateSlug('good-slug');
    expect(() => validateGoalAmount(0)).toThrow(BadRequestException);
    validateGoalAmount(null);
    expect(() =>
      validateDateOrder('2025-02-02T00:00:00Z', '2025-02-01T00:00:00Z'),
    ).toThrow(BadRequestException);
    expect(() => validateOfferPrice(10, 20, 'NGN')).toThrow(
      BadRequestException,
    );
    validateOfferPrice(25, 20, 'NGN');
  });

  it('staleRevisionConflict uses stable code', () => {
    try {
      throw staleRevisionConflict(3);
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as {
        code: string;
      };
      expect(body.code).toBe(CampaignAuthoringErrorCode.STALE_REVISION);
    }
  });

  it('authoringBadRequest and priceGuidancePayload', () => {
    const err = authoringBadRequest(
      CampaignAuthoringErrorCode.NOT_DRAFT,
      'nope',
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect(priceGuidancePayload(100, 'NGN')).toEqual(
      expect.objectContaining({ minimumPrice: 100, currency: 'NGN' }),
    );
  });
});
