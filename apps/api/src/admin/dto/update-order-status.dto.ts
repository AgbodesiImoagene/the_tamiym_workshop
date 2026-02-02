import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/enums';

const ALLOWED_STATUSES = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
] as const;

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ALLOWED_STATUSES })
  @IsString()
  @IsIn(ALLOWED_STATUSES)
  status!: (typeof ALLOWED_STATUSES)[number];
}
