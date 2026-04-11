import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  CurrencyCode,
  ShippingRateProvider,
} from '../../generated/prisma/enums';

export class UpdateShippingRateDto {
  @ApiPropertyOptional({ enum: ShippingRateProvider })
  @IsOptional()
  @IsEnum(ShippingRateProvider)
  provider?: ShippingRateProvider;

  @ApiPropertyOptional({ example: 'STANDARD' })
  @IsOptional()
  @IsString()
  serviceLevel?: string;

  @ApiPropertyOptional({ enum: CurrencyCode, default: CurrencyCode.NGN })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiPropertyOptional({ example: 1500, description: 'Flat fee amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  flatFee?: number;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'ISO date string' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string | null;

  @ApiPropertyOptional({ description: 'ISO date string' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minDeliveryDays?: number | null;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDeliveryDays?: number | null;
}
