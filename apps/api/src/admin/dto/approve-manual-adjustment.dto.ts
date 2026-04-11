import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ApproveManualAdjustmentDto {
  @ApiPropertyOptional({ description: 'Approver note' })
  @IsOptional()
  @IsString()
  approvalReason?: string;
}
