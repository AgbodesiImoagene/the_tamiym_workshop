import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateOptionValueDto {
  @ApiProperty({ example: 'L', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  valueCode?: string;

  @ApiProperty({ example: 'Large', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @ApiProperty({
    example: { hex: '#000000' },
    required: false,
    type: Object,
  })
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
