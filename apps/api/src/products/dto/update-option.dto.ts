import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateOptionDto {
  @ApiProperty({
    example: 'size',
    required: false,
    description: 'Unique per product. `colour` is saved as `color`.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @ApiProperty({ example: 'Size', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
