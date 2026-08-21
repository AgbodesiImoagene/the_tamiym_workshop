import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { APPEAL_STATEMENT_MAX_CHARS } from '../moderation.constants';

export class CreateAppealDto {
  @ApiProperty({ description: 'Moderation decision id to appeal' })
  @IsString()
  @IsNotEmpty()
  decisionId!: string;

  @ApiProperty({
    description: 'Owner statement (no binary evidence in slice 1)',
    maxLength: APPEAL_STATEMENT_MAX_CHARS,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(APPEAL_STATEMENT_MAX_CHARS)
  statement!: string;
}
