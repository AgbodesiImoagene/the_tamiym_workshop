import { ApiProperty } from '@nestjs/swagger';

export class GeoStateResponseDto {
  @ApiProperty({ example: 'LA', description: 'State code used in addresses' })
  code!: string;

  @ApiProperty({ example: 'Lagos' })
  name!: string;
}

export class GeoLgaResponseDto {
  @ApiProperty({ description: 'LGA id to send as `lgaId` on an address' })
  id!: string;

  @ApiProperty({ example: 'Ikeja' })
  name!: string;
}
