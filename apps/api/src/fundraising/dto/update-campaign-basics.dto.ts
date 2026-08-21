import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Owned DRAFT basics update. Clients must send the revision they last loaded.
 */
export class UpdateCampaignBasicsDto {
  @ApiProperty({
    example: 1,
    description:
      'Expected draftRevision; stale values yield 409 CAMPAIGN_STALE_REVISION',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedRevision!: number;

  @ApiPropertyOptional({ example: 'School Fundraiser 2025' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({ example: 'school-fundraiser-2025' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;

  @ApiPropertyOptional({ example: 'Raising funds for our school' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ example: 'Our story...' })
  @IsOptional()
  @IsString()
  story?: string | null;

  @ApiPropertyOptional({
    example: 500000,
    description: 'Goal in NGN major units; omit or null to clear',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  goalAmount?: number | null;

  @ApiPropertyOptional({ example: '2025-02-01T00:00:00Z', nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2025-02-28T23:59:59Z', nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}
