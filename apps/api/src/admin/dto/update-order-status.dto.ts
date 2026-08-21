import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/enums';

/**
 * Statuses that admin may set via PATCH.
 * FULFILLED/DELIVERED are derived by shipment APIs (TTW-040).
 * REFUNDED is set only by the refund flow.
 * CANCELLED is unpaid-only (PENDING_PAYMENT) per TTW-041; paid unwind uses refund.
 */
const ADMIN_SETTABLE_STATUSES = [
  OrderStatus.PROCESSING,
  OrderStatus.CANCELLED,
] as const;

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ADMIN_SETTABLE_STATUSES })
  @IsString()
  @IsIn(ADMIN_SETTABLE_STATUSES)
  status!: (typeof ADMIN_SETTABLE_STATUSES)[number];
}
