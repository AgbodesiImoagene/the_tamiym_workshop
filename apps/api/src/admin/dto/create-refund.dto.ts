import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, IsOptional, IsString, Max } from 'class-validator';
import { Type } from 'class-transformer';

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

  @ApiProperty({ required: false, description: 'Reason for the refund' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    required: false,
    description:
      'Optional idempotency key so retries reuse the same refund attempt (TTW-013)',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
