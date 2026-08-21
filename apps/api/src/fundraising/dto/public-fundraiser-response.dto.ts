import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PUBLIC_CAMPAIGN_OFFER_POLICY_VERSION,
  PUBLIC_CAMPAIGN_PRICE_DISCLOSURE,
} from '../../pricing/campaign-line-price';

/** Safe option-value metadata for public display (e.g. colour hex). */
export class PublicCampaignOptionValueDto {
  @ApiProperty({ example: 'ov-1' })
  id!: string;

  @ApiProperty({ example: 'BLACK' })
  valueCode!: string;

  @ApiProperty({ example: 'Black' })
  displayName!: string;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiPropertyOptional({
    description: 'Safe display metadata only (e.g. { hex: "#000000" })',
    nullable: true,
  })
  metadata?: Record<string, unknown> | null;
}

export class PublicCampaignOptionDto {
  @ApiProperty({ example: 'opt-1' })
  id!: string;

  @ApiProperty({ example: 'color' })
  code!: string;

  @ApiProperty({ example: 'Color' })
  name!: string;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ type: [PublicCampaignOptionValueDto] })
  values!: PublicCampaignOptionValueDto[];
}

export class PublicCampaignVariantOfferDto {
  @ApiProperty({ example: 'var-1' })
  id!: string;

  @ApiProperty({
    type: [String],
    description: 'ProductOptionValue ids that define this variant',
    example: ['ov-1', 'ov-2'],
  })
  optionValueIds!: string[];

  @ApiProperty({
    type: [String],
    description: 'Value codes aligned with optionValueIds',
    example: ['BLACK', 'L'],
  })
  optionValueCodes!: string[];

  @ApiProperty({
    description:
      'Whether the variant is currently selectable. Never includes exact stock counts.',
  })
  available!: boolean;

  @ApiProperty({
    description:
      'Display unit price in integer minor units (campaign base + option upcharges)',
    example: 550000,
  })
  unitAmountMinor!: number;

  @ApiProperty({ example: 'NGN' })
  currency!: string;
}

export class PublicCampaignDesignDto {
  @ApiProperty({ example: 'design-1' })
  id!: string;

  @ApiProperty({ example: 'School crest' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  thumbnailUrl?: string | null;
}

export class PublicCampaignProductSummaryDto {
  @ApiProperty({ example: 'prod-1' })
  id!: string;

  @ApiProperty({ example: 'Classic Tee' })
  name!: string;

  @ApiProperty({ example: 'classic-tee' })
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;
}

/**
 * One sellable campaign product offer for anonymous public fundraiser pages.
 * Policy: `public-campaign-offer/v1-interim-2026-08-21`.
 */
export class PublicCampaignOfferDto {
  @ApiProperty({ example: 'cp-1' })
  campaignProductId!: string;

  @ApiProperty({ example: 'prod-1' })
  productId!: string;

  @ApiProperty({ type: PublicCampaignProductSummaryDto })
  product!: PublicCampaignProductSummaryDto;

  @ApiProperty({ type: PublicCampaignDesignDto })
  design!: PublicCampaignDesignDto;

  @ApiProperty({
    description:
      'Campaign base price in integer minor units (before upcharges)',
    example: 500000,
  })
  baseAmountMinor!: number;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({
    description: PUBLIC_CAMPAIGN_PRICE_DISCLOSURE,
    example: PUBLIC_CAMPAIGN_PRICE_DISCLOSURE,
  })
  priceDisclosure!: string;

  @ApiProperty({ type: [PublicCampaignOptionDto] })
  options!: PublicCampaignOptionDto[];

  @ApiProperty({ type: [PublicCampaignVariantOfferDto] })
  variants!: PublicCampaignVariantOfferDto[];
}

export class PublicFundraiserPerformanceDto {
  @ApiProperty({ example: 120000 })
  currentAmount!: number;

  @ApiPropertyOptional({ nullable: true, example: 500000 })
  goalAmount?: number | null;

  @ApiProperty({ example: 'NGN' })
  currency!: string;
}

export class PublicFundraiserOrganizerDto {
  @ApiPropertyOptional({ nullable: true })
  firstName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastName?: string | null;
}

/**
 * Public fundraiser payload for GET /v1/public/fundraisers/:slug.
 * Does not expose SKU, cost basis, moderation notes, inventory counts, or organizer internals.
 */
export class PublicFundraiserResponseDto {
  @ApiProperty({ example: 'camp-1' })
  id!: string;

  @ApiProperty({ example: 'School Fundraiser' })
  title!: string;

  @ApiProperty({ example: 'school-fundraiser' })
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  story?: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  goalAmount?: number | null;

  @ApiProperty({ example: 120000 })
  currentAmount!: number;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  startDate?: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  endDate?: Date | null;

  @ApiPropertyOptional({ type: PublicFundraiserOrganizerDto, nullable: true })
  organizer?: PublicFundraiserOrganizerDto | null;

  @ApiProperty({ type: PublicFundraiserPerformanceDto })
  performance!: PublicFundraiserPerformanceDto;

  @ApiProperty({
    example: PUBLIC_CAMPAIGN_OFFER_POLICY_VERSION,
    description: 'Versioned offer/disclosure policy identifier',
  })
  offerPolicyVersion!: string;

  @ApiProperty({
    type: [PublicCampaignOfferDto],
    description: 'Sellable campaign product offers only',
  })
  products!: PublicCampaignOfferDto[];
}
