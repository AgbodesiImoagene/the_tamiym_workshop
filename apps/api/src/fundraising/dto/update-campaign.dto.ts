import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCampaignDto {
  @ApiProperty({ example: 'School Fundraiser 2025', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiProperty({ example: 'school-fundraiser-2025', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;

  @ApiProperty({ example: 'Raising funds for our school', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'Our story...', required: false })
  @IsOptional()
  @IsString()
  story?: string;

  @ApiProperty({ example: 500000, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  goalAmount?: number;

  @ApiProperty({ example: '2025-02-01T00:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ example: '2025-02-28T23:59:59Z', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
