import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { AddressText } from '../../addresses/dto/address-text.decorator';
import { ShippingRuleMatchType } from '../../generated/prisma/enums';

export class UpdateShippingRuleDto {
  @ApiPropertyOptional({
    example: 'NG',
    description:
      'ISO 3166-1 alpha-2 country code. Full-width and lower-case letters are folded to upper-case ASCII; a value that is not a real code is refused with 400.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiPropertyOptional({ enum: ShippingRuleMatchType })
  @IsOptional()
  @IsEnum(ShippingRuleMatchType)
  matchType?: ShippingRuleMatchType;

  @ApiPropertyOptional({ example: 'LA' })
  @IsOptional()
  @AddressText(200)
  matchValue?: string;

  @ApiPropertyOptional({ example: 'LA' })
  @IsOptional()
  @AddressText(200)
  matchContext?: string | null;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
