import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class RejectCampaignDto {
  @ApiProperty({
    description:
      'Reason shown to the organiser explaining why their campaign was rejected',
    example:
      'Campaign description contains prohibited content. Please revise and resubmit.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  rejectionReason!: string;

  @ApiProperty({
    description: 'Internal admin notes (not shown to organiser)',
    required: false,
    example: 'Flagged for misleading charity claims',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
