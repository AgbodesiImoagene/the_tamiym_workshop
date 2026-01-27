import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: '123 Main Street' })
  @IsString()
  @IsNotEmpty()
  street!: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Lagos State' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty({ example: '100001' })
  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @ApiProperty({ example: 'Nigeria', default: 'Nigeria', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ example: false, default: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
