import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuoteItemDto } from './quote-item.dto';

/**
 * Request body for POST /v1/orders/quote (standard) or POST /v1/campaigns/:campaignId/orders/quote (campaign).
 * Shipping is computed from the given address.
 */
export class QuoteRequestDto {
  @ApiProperty({
    example: 'addr-1',
    description: 'Address ID for shipping zone lookup',
  })
  @IsString()
  @IsNotEmpty()
  shippingAddressId!: string;

  @ApiProperty({ type: [QuoteItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one quote item is required' })
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}
