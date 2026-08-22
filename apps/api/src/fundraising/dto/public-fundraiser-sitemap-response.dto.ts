import { ApiProperty } from '@nestjs/swagger';

export class PublicFundraiserSitemapItemDto {
  @ApiProperty({ example: 'school-fundraiser' })
  slug!: string;

  @ApiProperty({ example: '2026-08-22T12:00:00.000Z' })
  updatedAt!: string;
}

export class PublicFundraiserSitemapResponseDto {
  @ApiProperty({ type: [PublicFundraiserSitemapItemDto] })
  items!: PublicFundraiserSitemapItemDto[];
}
