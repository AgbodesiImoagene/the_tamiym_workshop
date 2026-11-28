import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

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
  @IsOptionalStrictBoolean()
  trackInventory?: boolean;

  @ApiProperty({
    example: true,
    required: false,
    description: 'Variant isAvailable flag',
  })
  @IsOptionalStrictBoolean()
  isAvailable?: boolean;
}
