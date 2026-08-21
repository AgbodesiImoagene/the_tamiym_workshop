import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  Min,
  IsOptional,
  IsString,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  REFUND_REASON_CODES,
  RefundReasonCode,
} from '../../orders/resolution-policy';

export class CreateRefundDto {
  @ApiProperty({
    example: 5000,
    description: 'Refund amount in major currency (e.g. NGN)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(999_999_999.99)
  amount!: number;

  @ApiProperty({
    enum: REFUND_REASON_CODES,
    example: RefundReasonCode.DEFECT_OR_NOT_AS_DESCRIBED,
    description:
      'Stable TTW-041 refund reason code (server policy authority; required)',
  })
  @IsString()
  @IsIn([...REFUND_REASON_CODES])
  reasonCode!: RefundReasonCode;

  @ApiPropertyOptional({
    description: 'Optional free-text note (not used for eligibility)',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Optional idempotency key so retries reuse the same refund attempt (TTW-013)',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
