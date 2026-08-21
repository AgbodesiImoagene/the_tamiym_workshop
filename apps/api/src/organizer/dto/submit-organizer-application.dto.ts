import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';
import {
  INTENDED_USE_MAX,
  INTENDED_USE_MIN,
  ORGANISATION_NAME_MAX,
  ORGANISATION_NAME_MIN,
} from '../organizer.constants';

export class SubmitOrganizerApplicationDto {
  @ApiProperty({
    minLength: ORGANISATION_NAME_MIN,
    maxLength: ORGANISATION_NAME_MAX,
  })
  @IsString()
  @MinLength(ORGANISATION_NAME_MIN)
  @MaxLength(ORGANISATION_NAME_MAX)
  organisationName!: string;

  @ApiProperty({ minLength: INTENDED_USE_MIN, maxLength: INTENDED_USE_MAX })
  @IsString()
  @MinLength(INTENDED_USE_MIN)
  @MaxLength(INTENDED_USE_MAX)
  intendedUse!: string;

  @ApiProperty({ example: 'organiser-terms/v1-interim-2026-08-21' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  termsVersion!: string;

  @ApiProperty({
    description: 'ISO timestamp when the applicant accepted terms',
  })
  @IsDateString()
  termsAcceptedAt!: string;
}
