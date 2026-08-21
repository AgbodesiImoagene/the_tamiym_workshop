import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Add a campaign offer (product + owned design + required NGN price). */
export class AddCampaignOfferDto {
  @ApiProperty({
    example: 1,
    description:
      'Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedRevision!: number;

  @ApiProperty({ example: 'prod-1' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 'design-1' })
  @IsString()
  @IsNotEmpty()
  designId!: string;

  @ApiProperty({
    example: 15000,
    description: 'Selling price in NGN major units (≥ current server floor)',
  })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  price!: number;
}

/** Update an existing campaign offer’s design and/or price. */
export class UpdateCampaignOfferDto {
  @ApiProperty({
    example: 1,
    description:
      'Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedRevision!: number;

  @ApiPropertyOptional({ example: 'design-2' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  designId?: string;

  @ApiPropertyOptional({
    example: 16000,
    description: 'Selling price in NGN major units (≥ current server floor)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  price?: number;
}

/** Remove a campaign offer. */
export class RemoveCampaignOfferDto {
  @ApiProperty({
    example: 1,
    description:
      'Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedRevision!: number;
}
