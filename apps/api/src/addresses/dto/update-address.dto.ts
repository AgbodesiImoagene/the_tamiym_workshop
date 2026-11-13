import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsPhoneNumber,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  Length,
  MaxLength,
} from 'class-validator';
import { AddressProvider } from '../../generated/prisma/enums';

export class UpdateAddressDto {
  @ApiProperty({ example: '123 Main Street', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  addressLine1?: string;

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

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  state?: string;

  @ApiProperty({ example: '100001', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  postalCode?: string;

  @ApiProperty({ example: 'Nigeria', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  country?: string;

  @ApiProperty({ example: 'NG', required: false })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiProperty({ example: 'Near the roundabout', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  landmark?: string;

  @ApiProperty({
    type: String,
    example: 'Leave at gate',
    required: false,
    nullable: true,
    maxLength: 500,
    description:
      'Plain-text delivery instructions (at most 500 characters). Send null to remove saved instructions.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  instructions?: string | null;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  locality?: string;

  @ApiProperty({ example: 'Victoria Island', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  dependentLocality?: string;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  administrativeAreaLevel1?: string;

  @ApiProperty({ example: 'Ikeja', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  administrativeAreaLevel2?: string;

  @ApiProperty({ example: 'LA', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  stateCode?: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'cme4abcd1234',
    required: false,
    description:
      'LGA id. Omit to keep the saved LGA; send null to remove it (the state is not changed).',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lgaId?: string | null;

  @ApiProperty({ enum: AddressProvider, required: false })
  @IsOptional()
  @IsEnum(AddressProvider)
  provider?: AddressProvider;

  @ApiProperty({ example: 'ChIJrTLr-GyuEmsRBfy61i59si0', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  googlePlaceId?: string;

  @ApiProperty({
    example: '12 Broad Street, Lagos, Nigeria',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  formattedAddress?: string;

  @ApiProperty({ example: 6.5244, required: false })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({ example: 3.3792, required: false })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
