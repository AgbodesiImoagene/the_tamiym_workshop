import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

export class AnalyticsQueryDto {
  @ApiProperty({ example: '2025-01-01', required: false })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({ example: '2025-01-31', required: false })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
