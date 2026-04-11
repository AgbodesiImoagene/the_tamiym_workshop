import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsNotEmpty, Min, Max } from 'class-validator';

export class RequestManualAdjustmentDto {
  @ApiProperty({ example: 5000, description: 'Payout amount (NGN)' })
  @IsNumber()
  @Min(0.01)
  @Max(999_999_999.99)
  amount!: number;

  @ApiProperty({
    example: 'Goodwill adjustment per organizer request',
    description: 'Required reason for off-ledger payout',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
