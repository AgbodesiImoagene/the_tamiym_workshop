import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { ShippingRuleMatchType } from '../../generated/prisma/enums';

export class CreateShippingRuleDto {
  @ApiProperty({
    example: 'NG',
    description: 'ISO 3166-1 alpha-2 country code',
  })
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @ApiProperty({ enum: ShippingRuleMatchType })
  @IsEnum(ShippingRuleMatchType)
  matchType!: ShippingRuleMatchType;

  @ApiProperty({
    example: 'LA',
    description:
      'Canonical match value. For Nigeria ADMIN1 use state code; for ADMIN2 use LGA id or name.',
  })
  @IsString()
  matchValue!: string;

  @ApiPropertyOptional({
    example: 'LA',
    description:
      'Optional context to disambiguate the rule, such as the parent ADMIN1 code for ADMIN2.',
  })
  @IsOptional()
  @IsString()
  matchContext?: string | null;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
