import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum } from 'class-validator';
import { PayoutMode } from '../../generated/prisma/enums';

export class CreatePayoutRunDto {
  @ApiProperty({
    example: '2025-03-22T00:00:00Z',
    description: 'Scheduled execution time',
  })
  @IsDateString()
  scheduledFor!: string;

  @ApiProperty({
    example: '2025-03-15T23:59:59Z',
    description: 'Settlement cutoff (orders paid before this count)',
  })
  @IsDateString()
  cutoffAt!: string;

  @ApiProperty({
    enum: PayoutMode,
    description: 'MANUAL, AUTO_APPROVAL_REQUIRED, or AUTO_EXECUTE',
  })
  @IsEnum(PayoutMode)
  mode!: PayoutMode;
}
