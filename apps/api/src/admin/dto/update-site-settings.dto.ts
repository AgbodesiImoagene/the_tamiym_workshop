import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsEnum,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { CurrencyCode, PayoutMode } from '../../generated/prisma/enums';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

export class UpdateSiteSettingsDto {
  @ApiPropertyOptional({
    example: 0.075,
    description:
      'VAT rate (e.g. 0.075 for 7.5%). At most 4 decimal places, the stored precision; finer values are rejected rather than rounded (TTW-084).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  vatRate?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptionalStrictBoolean()
  pricesIncludeVat?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptionalStrictBoolean()
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
  @IsOptionalStrictBoolean()
  autoRetryFailedPayouts?: boolean;

  @ApiPropertyOptional({
    example: 'Tamiym Workshop Ltd',
    description:
      'Seller legal name printed on VAT invoices (TTW-108). An empty string clears it. Invoices cannot be issued while it is empty.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  invoiceSellerLegalName?: string;

  @ApiPropertyOptional({
    example: '1 Example Road, Ikeja, Lagos, Nigeria',
    description:
      'Seller address printed on VAT invoices (TTW-108). An empty string clears it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  invoiceSellerAddress?: string;

  @ApiPropertyOptional({
    example: '12345678-0001',
    description:
      'Seller tax identification number printed on VAT invoices (TTW-108). An empty string clears it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceSellerTaxNumber?: string;
}
