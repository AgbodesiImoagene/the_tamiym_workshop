import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SHIPMENT_CARRIER_CODES } from '../shipments.constants';

export class CreateShipmentDto {
  @ApiProperty({
    enum: SHIPMENT_CARRIER_CODES,
    default: 'MANUAL',
    description: 'Carrier vocabulary code (no live carrier adapter in v1)',
  })
  @IsString()
  @IsIn(SHIPMENT_CARRIER_CODES)
  carrierCode!: (typeof SHIPMENT_CARRIER_CODES)[number];

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  serviceCode?: string;

  @ApiPropertyOptional({
    description: 'Optional calendar estimated delivery (ISO-8601)',
  })
  @IsOptional()
  @IsString()
  estimatedDeliveryAt?: string;

  @ApiPropertyOptional({
    description: 'Client idempotency key for the READY event',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  privateNotes?: string;
}
