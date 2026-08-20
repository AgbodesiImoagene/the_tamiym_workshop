import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ModerationStatus } from '../../generated/prisma/enums';

export class ResolveAppealDto {
  @ApiProperty({ enum: ['UPHELD', 'OVERTURNED'] })
  @IsIn(['UPHELD', 'OVERTURNED'])
  resolution!: 'UPHELD' | 'OVERTURNED';

  @ApiPropertyOptional({
    enum: [
      ModerationStatus.APPROVED,
      ModerationStatus.REJECTED,
      ModerationStatus.FLAGGED,
    ],
    description: 'When OVERTURNED, optional new outcome (defaults to APPROVED)',
  })
  @IsOptional()
  @IsEnum(ModerationStatus)
  status?: ModerationStatus;

  @ApiPropertyOptional({
    description: 'Internal reviewer notes (not returned to owners)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Optional customer-safe explanation override',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerExplanation?: string;
}
