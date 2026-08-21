import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus } from '../generated/prisma/enums';
import {
  CampaignAuthoringErrorCode,
  CAMPAIGN_PRICE_FLOOR_GUIDANCE,
} from './campaign-authoring.constants';

export function authoringBadRequest(
  code: CampaignAuthoringErrorCode,
  message: string,
  extra?: Record<string, unknown>,
): BadRequestException {
  return new BadRequestException({ message, code, ...extra });
}

export function authoringConflict(
  code: CampaignAuthoringErrorCode,
  message: string,
  extra?: Record<string, unknown>,
): ConflictException {
  return new ConflictException({ message, code, ...extra });
}

export function staleRevisionConflict(
  currentRevision?: number,
): ConflictException {
  return authoringConflict(
    CampaignAuthoringErrorCode.STALE_REVISION,
    'This draft was updated elsewhere. Reload the latest revision and try again.',
    {
      currentRevision: currentRevision ?? null,
      guidance: 'Reload the campaign editor and re-apply your changes.',
    },
  );
}

export function assertDraftMutable(status: CampaignStatus): void {
  if (status !== CampaignStatus.DRAFT) {
    throw authoringBadRequest(
      CampaignAuthoringErrorCode.NOT_DRAFT,
      `Only DRAFT campaigns can be edited (current status: ${status})`,
    );
  }
}

export function assertOwned(
  organizerId: string,
  campaignOrganizerId: string,
): void {
  if (campaignOrganizerId !== organizerId) {
    throw new ForbiddenException('Access denied');
  }
}

export function assertCampaignFound<T>(
  campaign: T | null | undefined,
): asserts campaign is T {
  if (!campaign) {
    throw new NotFoundException('Campaign not found');
  }
}

export function validateGoalAmount(
  goalAmount: number | null | undefined,
): void {
  if (goalAmount === undefined || goalAmount === null) return;
  if (!Number.isFinite(goalAmount) || goalAmount <= 0) {
    throw authoringBadRequest(
      CampaignAuthoringErrorCode.GOAL_INVALID,
      'goalAmount must be a positive number when set',
    );
  }
}

export function validateSlug(slug: string): void {
  const trimmed = slug.trim();
  if (!trimmed || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    throw authoringBadRequest(
      CampaignAuthoringErrorCode.SLUG_INVALID,
      'slug must be a lowercase URL-safe kebab string',
    );
  }
}

export function validateTitle(title: string): void {
  if (!title.trim()) {
    throw authoringBadRequest(
      CampaignAuthoringErrorCode.TITLE_INVALID,
      'title must not be empty',
    );
  }
}

export function validateDateOrder(
  startDate?: string | null,
  endDate?: string | null,
): void {
  if (!startDate || !endDate) return;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
    throw authoringBadRequest(
      CampaignAuthoringErrorCode.DATE_ORDER_INVALID,
      'endDate must be after startDate',
    );
  }
}

export function validateOfferPrice(
  price: number,
  minimumPrice: number,
  currency: string,
): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw authoringBadRequest(
      CampaignAuthoringErrorCode.PRICE_INVALID,
      'price must be a positive NGN amount',
    );
  }
  if (price < minimumPrice) {
    throw authoringBadRequest(
      CampaignAuthoringErrorCode.PRICE_BELOW_FLOOR,
      `Campaign price must be at least ${minimumPrice} ${currency}`,
      {
        minimumPrice,
        currency,
        guidance: CAMPAIGN_PRICE_FLOOR_GUIDANCE,
      },
    );
  }
}

export function priceGuidancePayload(
  minimumPrice: number,
  currency: string,
): {
  currency: string;
  minimumPrice: number;
  guidance: string;
} {
  return {
    currency,
    minimumPrice,
    guidance: CAMPAIGN_PRICE_FLOOR_GUIDANCE,
  };
}
