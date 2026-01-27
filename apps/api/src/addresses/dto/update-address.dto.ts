import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdateAddressDto {
  @ApiProperty({ example: '123 Main Street', required: false })
  @IsString()
  @IsOptional()
  street?: string;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ example: 'Lagos State', required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ example: '100001', required: false })
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiProperty({ example: 'Nigeria', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
