import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsObject } from 'class-validator';

export class UpdateDesignDto {
  @ApiProperty({ example: 'My Tee Design', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({
    description: 'Structured design data (version, views, layers per view)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  designData?: Record<string, unknown>;

  @ApiProperty({
    example: 'https://cdn.example.com/thumb.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
