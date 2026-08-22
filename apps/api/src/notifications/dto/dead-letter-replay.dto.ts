import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DeadLetterReplayDto {
  @ApiProperty({ description: 'Operator reason recorded on acknowledgement.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class DeadLetterBulkReplayDto extends DeadLetterReplayDto {
  @ApiProperty({ type: [String], maxItems: 25 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @IsString({ each: true })
  ids!: string[];
}

export class DeadLetterAcknowledgeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
