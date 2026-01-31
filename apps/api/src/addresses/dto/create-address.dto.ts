import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsPhoneNumber,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: '123 Main Street' })
  @IsString()
  @IsNotEmpty()
  addressLine1!: string;

  @ApiProperty({ example: 'Apt 4B', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  addressLine2?: string;

  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  recipientName?: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty({ example: '100001', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  postalCode?: string;

  @ApiProperty({ example: 'Nigeria', default: 'Nigeria', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  country?: string;

  @ApiProperty({ example: 'Near the roundabout', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  landmark?: string;

  @ApiProperty({ example: 'Leave at gate', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  instructions?: string;

  @ApiProperty({ example: false, default: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
