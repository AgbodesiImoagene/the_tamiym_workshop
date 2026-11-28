import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

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
  @IsOptionalStrictBoolean()
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
      'What the brackets measure. Send null to clear every bracket (flat fee only).',
  })
  @IsOptional()
  @IsEnum(ShippingRateBracketBasis)
  bracketBasis?: ShippingRateBracketBasis | null;

  @ApiPropertyOptional({
    type: [ShippingRateBracketDto],
    description:
      'The full new list of brackets (replaces the old one). Leave out to keep the current brackets.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShippingRateBracketDto)
  brackets?: ShippingRateBracketDto[];
}
