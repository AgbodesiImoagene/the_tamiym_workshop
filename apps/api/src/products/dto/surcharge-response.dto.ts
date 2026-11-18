import { ApiProperty } from '@nestjs/swagger';
import { CurrencyCode } from '../../generated/prisma/enums';

/** A size (option value) upcharge, as shown to the admin (TTW-094). */
export class OptionValueUpchargeResponseDto {
  @ApiProperty({ description: 'Option the value belongs to' })
  optionId!: string;

  @ApiProperty({ description: 'Option value the upcharge applies to' })
  valueId!: string;

  @ApiProperty({ enum: CurrencyCode, example: CurrencyCode.NGN })
  currency!: CurrencyCode;

  @ApiProperty({
    example: '500.00',
    description: 'Decimal string with 2 places',
  })
  amount!: string;
}

/** A product-level print-side surcharge, as shown to the admin (TTW-094). */
export class ViewSurchargeResponseDto {
  @ApiProperty({ description: 'Product view (front, back, ...) it applies to' })
  viewId!: string;

  @ApiProperty({ enum: CurrencyCode, example: CurrencyCode.NGN })
  currency!: CurrencyCode;

  @ApiProperty({
    example: '1000.00',
    description: 'Decimal string with 2 places',
  })
  amount!: string;
}

export class ProductSurchargesResponseDto {
  @ApiProperty({ type: [OptionValueUpchargeResponseDto] })
  optionValueUpcharges!: OptionValueUpchargeResponseDto[];

  @ApiProperty({
    type: [ViewSurchargeResponseDto],
    description:
      'Product-level surcharges only. Variant-level overrides are not editable here.',
  })
  viewSurcharges!: ViewSurchargeResponseDto[];
}
