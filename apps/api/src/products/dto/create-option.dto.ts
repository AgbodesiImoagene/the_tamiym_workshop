import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOptionDto {
  @ApiProperty({ example: 'size' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Size' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
