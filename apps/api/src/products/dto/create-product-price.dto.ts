import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrencyCode } from '../../generated/prisma/enums';
import { DEFAULT_CURRENCY } from '../../constants';

export class CreateProductPriceDto {
  @ApiProperty({ enum: CurrencyCode, example: DEFAULT_CURRENCY })
  @IsEnum(CurrencyCode)
  currency!: CurrencyCode;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  @Type(() => Number)
  amount!: number;

  @ApiProperty({ example: 20000, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  compareAt?: number;
}
