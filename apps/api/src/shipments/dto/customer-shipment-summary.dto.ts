import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ShipmentEventType,
  ShipmentStatus,
} from '../../generated/prisma/enums';
import { SHIPMENT_POLICY_VERSION } from '../shipments.constants';

/** Customer-safe shipment event (no private notes / actor ids). */
export class CustomerShipmentEventDto {
  @ApiProperty({ example: 'evt-1' })
  id!: string;

  @ApiProperty({ enum: ShipmentEventType })
  type!: ShipmentEventType;

  @ApiProperty()
  occurredAt!: string;

  @ApiPropertyOptional({ nullable: true })
  customerMessage?: string | null;

  @ApiPropertyOptional({ nullable: true })
  exceptionCode?: string | null;
}

/** Customer-safe shipment summary + timeline (TTW-040). */
export class CustomerShipmentSummaryDto {
  @ApiProperty({ example: SHIPMENT_POLICY_VERSION })
  policyVersion!: string;

  @ApiProperty({ example: 'ship-1' })
  id!: string;

  @ApiProperty({ enum: ShipmentStatus })
  status!: ShipmentStatus;

  @ApiProperty({ example: 'Manual dispatch' })
  carrierName!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Present only after dispatch',
  })
  trackingNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  trackingUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  estimatedDeliveryAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  exceptionCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  exceptionMessage?: string | null;

  @ApiProperty({ type: [CustomerShipmentEventDto] })
  events!: CustomerShipmentEventDto[];
}
