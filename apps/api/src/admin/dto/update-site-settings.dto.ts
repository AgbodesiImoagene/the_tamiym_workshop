import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { CurrencyCode, PayoutMode } from '../../generated/prisma/enums';

export class UpdateSiteSettingsDto {
  @ApiPropertyOptional({
    example: 0.075,
    description: 'VAT rate (e.g. 0.075 for 7.5%)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vatRate?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  pricesIncludeVat?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  vatAppliesToShipping?: boolean;

  @ApiPropertyOptional({ enum: CurrencyCode })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiPropertyOptional({
    enum: PayoutMode,
    description:
      'Fundraiser payout mode: MANUAL, AUTO_APPROVAL_REQUIRED, AUTO_EXECUTE. AUTO_EXECUTE requires PAYOUT_AUTO_EXECUTE_ENABLED=true (TTW-042).',
  })
  @IsOptional()
  @IsEnum(PayoutMode)
  payoutMode?: PayoutMode;

  @ApiPropertyOptional({
    example: 7,
    description: 'Payout cadence in days (e.g. 7 = weekly)',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  payoutCadenceDays?: number;

  @ApiPropertyOptional({
    example: 7,
    description: 'Settlement hold days before payout eligibility',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(365)
  payoutSettlementHoldDays?: number;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Minimum payout amount in NGN',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumPayoutAmount?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Auto-retry failed Paystack transfers',
  })
  @IsOptional()
  @IsBoolean()
  autoRetryFailedPayouts?: boolean;
}
