import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TemplateEffectType } from '../../generated/prisma/enums';

export class UpdateTemplateEffectDto {
  @ApiProperty({ example: 'option-id', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  optionId?: string;

  @ApiProperty({ example: 'option-value-id', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  optionValueId?: string;

  @ApiProperty({ example: 'template-layer-id', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  templateLayerId?: string;

  @ApiProperty({ enum: TemplateEffectType, required: false })
  @IsOptional()
  @IsEnum(TemplateEffectType)
  effectType?: TemplateEffectType;

  @ApiProperty({ example: '#00FF00', required: false })
  @IsOptional()
  @IsString()
  tintHex?: string;

  @ApiProperty({ example: 'replacement-image-id', required: false })
  @IsOptional()
  @IsString()
  replacementImageId?: string;

  @ApiProperty({ example: { opacity: 0.8 }, required: false, type: Object })
  @IsOptional()
  meta?: Record<string, unknown>;
}
