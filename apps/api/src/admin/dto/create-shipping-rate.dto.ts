import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CurrencyCode,
  ShippingRateBracketBasis,
  ShippingRateProvider,
} from '../../generated/prisma/enums';
import { ShippingRateBracketDto } from './shipping-rate-bracket.dto';

export class CreateShippingRateDto {
  @ApiPropertyOptional({ enum: ShippingRateProvider })
  @IsOptional()
  @IsEnum(ShippingRateProvider)
  provider?: ShippingRateProvider;

  @ApiPropertyOptional({ example: 'STANDARD', default: 'STANDARD' })
  @IsOptional()
  @IsString()
  serviceLevel?: string;

  @ApiPropertyOptional({ enum: CurrencyCode, default: CurrencyCode.NGN })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiProperty({ example: 1500, description: 'Flat fee amount' })
  @IsNumber()
  @Min(0)
  flatFee!: number;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ default: true })
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

  @ApiPropertyOptional({
    enum: ShippingRateBracketBasis,
    nullable: true,
    description:
      'What the brackets measure. Leave out (or null) for a flat-fee-only rate.',
  })
  @IsOptional()
  @IsEnum(ShippingRateBracketBasis)
  bracketBasis?: ShippingRateBracketBasis | null;

  @ApiPropertyOptional({
    type: [ShippingRateBracketDto],
    description:
      'Brackets in addition to the flat fee. Requires `bracketBasis`; minimums must be unique.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShippingRateBracketDto)
  brackets?: ShippingRateBracketDto[];
}
