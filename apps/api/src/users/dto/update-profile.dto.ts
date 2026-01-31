import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsPhoneNumber,
  IsNotEmpty,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'John', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsPhoneNumber()
  @IsOptional()
  phone?: string;
}
