import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsPhoneNumber,
  IsEnum,
  IsNumber,
  IsISO31661Alpha2,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AddressText } from './address-text.decorator';
import { canonicalCountryCode } from '../../shipping/country-code';
import { AddressProvider } from '../../generated/prisma/enums';

export class UpdateAddressDto {
  @ApiProperty({
    maxLength: 500,
    example: '123 Main Street',
    required: false,
  })
  @IsOptional()
  @AddressText(500)
  addressLine1?: string;

  @ApiProperty({
    maxLength: 500,
    example: 'Apt 4B',
    required: false,
  })
  @IsOptional()
  @AddressText(500)
  addressLine2?: string;

  @ApiProperty({
    maxLength: 200,
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @AddressText(200)
  recipientName?: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiProperty({
    maxLength: 200,
    example: 'Lagos',
    required: false,
  })
  @IsOptional()
  @AddressText(200)
  city?: string;

  @ApiProperty({
    maxLength: 200,
    example: 'Lagos',
    required: false,
  })
  @IsOptional()
  @AddressText(200)
  state?: string;

  @ApiProperty({
    maxLength: 20,
    example: '100001',
    required: false,
  })
  @IsOptional()
  @AddressText(20)
  postalCode?: string;

  @ApiProperty({
    maxLength: 200,
    example: 'Nigeria',
    required: false,
  })
  @IsOptional()
  @AddressText(200)
  country?: string;

  @ApiProperty({
    example: 'NG',
    required: false,
    description:
      'ISO 3166-1 alpha-2 country code. Full-width and lower-case letters are folded to upper-case ASCII (for example NG); anything that is not a real code is refused with 400.',
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => canonicalCountryCode(value) ?? value,
  )
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryCode must be a valid ISO 3166-1 alpha-2 code',
  })
  @IsISO31661Alpha2()
  countryCode?: string;

  @ApiProperty({
    maxLength: 500,
    example: 'Near the roundabout',
    required: false,
  })
  @IsOptional()
  @AddressText(500)
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
  @AddressText(500)
  instructions?: string | null;

  @ApiProperty({
    maxLength: 200,
    example: 'Lagos',
    required: false,
  })
  @IsOptional()
  @AddressText(200)
  locality?: string;

  @ApiProperty({
    maxLength: 200,
    example: 'Victoria Island',
    required: false,
  })
  @IsOptional()
  @AddressText(200)
  dependentLocality?: string;

  @ApiProperty({
    maxLength: 200,
    example: 'Lagos',
    required: false,
  })
  @IsOptional()
  @AddressText(200)
  administrativeAreaLevel1?: string;

  @ApiProperty({
    maxLength: 200,
    example: 'Ikeja',
    required: false,
  })
  @IsOptional()
  @AddressText(200)
  administrativeAreaLevel2?: string;

  @ApiProperty({
    maxLength: 10,
    example: 'LA',
    required: false,
    description:
      'Code of the state. It identifies the state and decides the stored name; a state text that names another state is refused (ADDRESS_STATE_MISMATCH). Only used for Nigerian addresses: for any other country it is ignored and stored as null.',
  })
  @IsOptional()
  @AddressText(10)
  stateCode?: string;

  @ApiProperty({
    maxLength: 64,
    type: String,
    nullable: true,
    example: 'cme4abcd1234',
    required: false,
    description:
      'LGA id. Omit to keep the saved LGA; send null to remove it (the state is not changed). Only used for Nigerian addresses: for any other country it is ignored and stored as null.',
  })
  @IsOptional()
  @AddressText(64)
  lgaId?: string | null;

  @ApiProperty({ enum: AddressProvider, required: false })
  @IsOptional()
  @IsEnum(AddressProvider)
  provider?: AddressProvider;

  @ApiProperty({
    maxLength: 300,
    example: 'ChIJrTLr-GyuEmsRBfy61i59si0',
    required: false,
  })
  @IsOptional()
  @AddressText(300)
  googlePlaceId?: string;

  @ApiProperty({
    maxLength: 500,
    example: '12 Broad Street, Lagos, Nigeria',
    required: false,
  })
  @IsOptional()
  @AddressText(500)
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
