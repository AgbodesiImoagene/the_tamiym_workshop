import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ImageRole } from '../../generated/prisma/enums';

export class UpdateProductImageRoleDto {
  @ApiProperty({ enum: ImageRole, required: false })
  @IsOptional()
  @IsEnum(ImageRole)
  role?: ImageRole;

  @ApiProperty({ example: 'product-view-id', required: false })
  @IsOptional()
  @IsString()
  productViewId?: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
