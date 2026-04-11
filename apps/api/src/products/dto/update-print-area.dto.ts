import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePrintAreaDto {
  @ApiProperty({ example: 0.1, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  x?: number;

  @ApiProperty({ example: 0.2, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  y?: number;

  @ApiProperty({ example: 0.6, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  width?: number;

  @ApiProperty({ example: 0.5, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  height?: number;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  rotationAllowed?: boolean;

  @ApiProperty({ example: 5, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxLayers?: number;

  @ApiProperty({ example: 6, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxColors?: number;
}
