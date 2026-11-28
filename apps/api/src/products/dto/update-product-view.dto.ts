import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

export class UpdateProductViewDto {
  @ApiProperty({ example: 'front', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  key?: string;

  @ApiProperty({ example: 'Front', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptionalStrictBoolean()
  isDesignable?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptionalStrictBoolean()
  isDefault?: boolean;
}
