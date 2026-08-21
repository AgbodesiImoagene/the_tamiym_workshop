import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  CurrencyCode,
  OrderStatus,
  PaymentStatus,
} from '../../generated/prisma/enums';
import {
  AnalyticsExportEntity,
  AnalyticsSalesChannel,
  ANALYTICS_DRILLDOWN_MAX_TAKE,
} from '../analytics-contract';

const LAGOS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Shared validated analytics query contract (TTW-036).
 * Calendar dates are Africa/Lagos civil days (`YYYY-MM-DD`).
 */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    example: '2025-01-01',
    description: 'Inclusive Lagos calendar start date (YYYY-MM-DD)',
  })
  @IsOptional()
  @Matches(LAGOS_DATE, {
    message: 'dateFrom must be YYYY-MM-DD (Africa/Lagos calendar day)',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2025-01-31',
    description: 'Inclusive Lagos calendar end date (YYYY-MM-DD)',
  })
  @IsOptional()
  @Matches(LAGOS_DATE, {
    message: 'dateTo must be YYYY-MM-DD (Africa/Lagos calendar day)',
  })
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Filter to a single campaign id' })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional({
    description: 'Orders that include at least one line for this product',
  })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({
    enum: AnalyticsSalesChannel,
    description: 'STORE = no campaign; FUNDRAISER = campaign order',
  })
  @IsOptional()
  @IsEnum(AnalyticsSalesChannel)
  channel?: AnalyticsSalesChannel;

  @ApiPropertyOptional({
    enum: CurrencyCode,
    description: 'v1 supports NGN only',
  })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiPropertyOptional({
    enum: AnalyticsExportEntity,
    description: 'Export entity (orders|campaigns). Unknown values rejected.',
  })
  @IsOptional()
  @IsEnum(AnalyticsExportEntity)
  entity?: AnalyticsExportEntity;

  @ApiPropertyOptional({
    description: 'Opaque cursor (entity id) for drill-down pagination',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    example: 50,
    description: `Drill-down page size (1–${ANALYTICS_DRILLDOWN_MAX_TAKE})`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ANALYTICS_DRILLDOWN_MAX_TAKE)
  take?: number;
}
