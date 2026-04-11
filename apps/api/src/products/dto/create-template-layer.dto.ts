import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BlendMode, TemplateLayerType } from '../../generated/prisma/enums';

export class CreateTemplateLayerDto {
  @ApiProperty({ example: 'base' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ example: 'Base layer', required: false })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({ enum: TemplateLayerType, example: TemplateLayerType.BASE })
  @IsEnum(TemplateLayerType)
  layerType!: TemplateLayerType;

  @ApiProperty({ example: 'image-id' })
  @IsString()
  @IsNotEmpty()
  imageId!: string;

  @ApiProperty({ enum: BlendMode, required: false })
  @IsOptional()
  @IsEnum(BlendMode)
  blendMode?: BlendMode;

  @ApiProperty({ example: 1.0, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  opacity?: number;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  zIndex?: number;

  @ApiProperty({ example: { scale: 1.0 }, required: false, type: Object })
  @IsOptional()
  meta?: Record<string, unknown>;
}
