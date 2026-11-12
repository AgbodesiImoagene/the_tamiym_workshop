import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto';

/** Longest order note, in UTF-16 code units (what `MaxLength` and the browser count). */
export const ORDER_NOTE_MAX_LENGTH = 500;

export class CreateOrderDto {
  @ApiProperty({ example: 'addr-1' })
  @IsString()
  @IsNotEmpty()
  shippingAddressId!: string;

  @ApiProperty({ type: [CreateOrderItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one order item is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  /** Idempotency key to avoid duplicate orders on retries. If provided and an order already exists with this key, that order is returned. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idempotencyKey?: string;

  /**
   * Optional note about the order (TTW-197). Trimmed; a blank note is stored as
   * null. Plain text only; never changes price, stock, shipping or payment.
   */
  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    maxLength: ORDER_NOTE_MAX_LENGTH,
    example: 'Please pack the two hoodies separately',
  })
  @IsOptional()
  // `Object` keeps implicit conversion from turning a number into a string.
  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @IsString()
  @MaxLength(ORDER_NOTE_MAX_LENGTH)
  customerNote?: string | null;
}
