import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ImageRole } from '../../generated/prisma/enums';

export class CreateProductImageRoleDto {
  @ApiProperty({ enum: ImageRole, example: ImageRole.THUMBNAIL })
  @IsEnum(ImageRole)
  role!: ImageRole;

  @ApiProperty({ example: 'product-view-id', required: false })
  @IsOptional()
  @IsString()
  productViewId?: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
