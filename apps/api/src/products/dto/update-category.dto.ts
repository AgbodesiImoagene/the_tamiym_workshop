import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({ example: 'T-Shirts', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ example: 't-shirts', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;

  @ApiProperty({ example: 'Comfortable cotton t-shirts', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
