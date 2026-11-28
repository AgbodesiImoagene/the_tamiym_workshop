import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { AddressText } from '../../addresses/dto/address-text.decorator';
import { ShippingRuleMatchType } from '../../generated/prisma/enums';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

export class CreateShippingRuleDto {
  @ApiProperty({
    example: 'NG',
    description:
      'ISO 3166-1 alpha-2 country code. Full-width and lower-case letters are folded to upper-case ASCII; a value that is not a real code is refused with 400.',
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
  @AddressText(200)
  matchValue!: string;

  @ApiPropertyOptional({
    example: 'LA',
    description:
      'Optional context to disambiguate the rule, such as the parent ADMIN1 code for ADMIN2.',
  })
  @IsOptional()
  @AddressText(200)
  matchContext?: string | null;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptionalStrictBoolean()
  isActive?: boolean;
}
