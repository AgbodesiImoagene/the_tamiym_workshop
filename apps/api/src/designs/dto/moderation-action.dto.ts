import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ModerationStatus } from '../../generated/prisma/enums';

const ALLOWED_MODERATION_STATUSES = [
  ModerationStatus.APPROVED,
  ModerationStatus.REJECTED,
  ModerationStatus.FLAGGED,
] as const;

export class ModerationActionDto {
  @ApiProperty({
    enum: ALLOWED_MODERATION_STATUSES,
    description: 'Moderation outcome (APPROVED, REJECTED, or FLAGGED)',
  })
  @IsIn(ALLOWED_MODERATION_STATUSES)
  status!: (typeof ALLOWED_MODERATION_STATUSES)[number];

  @ApiProperty({
    description:
      'Optional admin notes stored alongside the moderation decision (internal only)',
    required: false,
    example: 'Contains prohibited text in front-view layer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
