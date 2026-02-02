import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ModerationStatus } from '../../generated/prisma/enums';

const ALLOWED_MODERATION_STATUSES = [
  ModerationStatus.APPROVED,
  ModerationStatus.REJECTED,
  ModerationStatus.FLAGGED,
] as const;

export class ModerationActionDto {
  @ApiProperty({
    enum: ALLOWED_MODERATION_STATUSES,
    description: 'Moderation outcome (approve, reject, or flag)',
  })
  @IsIn(ALLOWED_MODERATION_STATUSES)
  status!: (typeof ALLOWED_MODERATION_STATUSES)[number];
}
