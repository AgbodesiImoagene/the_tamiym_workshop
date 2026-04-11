import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, IsOptional, IsString, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class InitiatePayoutDto {
  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(999_999_999.99)
  amount!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
