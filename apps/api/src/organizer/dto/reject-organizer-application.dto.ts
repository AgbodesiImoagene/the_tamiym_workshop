import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  CUSTOMER_VISIBLE_REASON_MAX,
  CUSTOMER_VISIBLE_REASON_MIN,
  INTERNAL_NOTES_MAX,
} from '../organizer.constants';

export class RejectOrganizerApplicationDto {
  @ApiProperty({
    minLength: CUSTOMER_VISIBLE_REASON_MIN,
    maxLength: CUSTOMER_VISIBLE_REASON_MAX,
    description: 'Customer-safe rejection reason (no internal notes)',
  })
  @IsString()
  @MinLength(CUSTOMER_VISIBLE_REASON_MIN)
  @MaxLength(CUSTOMER_VISIBLE_REASON_MAX)
  customerVisibleReason!: string;

  @ApiPropertyOptional({ maxLength: INTERNAL_NOTES_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(INTERNAL_NOTES_MAX)
  internalNotes?: string;
}
