import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateInventoryDto {
  @ApiProperty({ example: 100, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stockOnHand?: number;

  @ApiProperty({ example: 5, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  reserved?: number;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiProperty({
    example: true,
    required: false,
    description: 'Variant isAvailable flag',
  })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
