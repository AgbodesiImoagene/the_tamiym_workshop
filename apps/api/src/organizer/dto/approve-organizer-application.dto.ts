import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { INTERNAL_NOTES_MAX } from '../organizer.constants';

export class ApproveOrganizerApplicationDto {
  @ApiPropertyOptional({ maxLength: INTERNAL_NOTES_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(INTERNAL_NOTES_MAX)
  internalNotes?: string;
}
