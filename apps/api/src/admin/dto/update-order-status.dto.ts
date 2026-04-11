import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/enums';

/**
 * Statuses that admin may set via PATCH. REFUNDED is set only by the refund flow; CANCELLED only from PENDING_PAYMENT.
 */
const ADMIN_SETTABLE_STATUSES = [
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
] as const;

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ADMIN_SETTABLE_STATUSES })
  @IsString()
  @IsIn(ADMIN_SETTABLE_STATUSES)
  status!: (typeof ADMIN_SETTABLE_STATUSES)[number];
}
