import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SHIPMENT_EXCEPTION_CODES } from '../shipments.constants';

const UPDATABLE_STATUSES = [
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'CANCELLED',
] as const;

export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: UPDATABLE_STATUSES })
  @IsString()
  @IsIn(UPDATABLE_STATUSES)
  status!: (typeof UPDATABLE_STATUSES)[number];

  @ApiProperty({
    description: 'Idempotency key unique per shipment for this transition',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Required when status is DISPATCHED (and later non-cancel)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  trackingNumber?: string;

  @ApiPropertyOptional({
    description: 'https URL on the interim allowlist',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  trackingUrl?: string;

  @ApiPropertyOptional({ enum: SHIPMENT_EXCEPTION_CODES })
  @IsOptional()
  @IsString()
  @IsIn(SHIPMENT_EXCEPTION_CODES)
  exceptionCode?: (typeof SHIPMENT_EXCEPTION_CODES)[number];

  @ApiPropertyOptional({
    description: 'Customer-safe exception override (max 500)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerMessage?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNotes?: string;

  @ApiPropertyOptional({
    description: 'Required when correcting a prior mistaken event',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  supersedesEventId?: string;

  @ApiPropertyOptional({
    description: 'Required with supersedesEventId — audit reason',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  correctionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
