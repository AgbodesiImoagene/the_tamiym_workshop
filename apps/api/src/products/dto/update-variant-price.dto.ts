import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrencyCode } from '../../generated/prisma/enums';

export class UpdateVariantPriceDto {
  @ApiProperty({ enum: CurrencyCode, required: false })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiProperty({ example: 16000, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amount?: number;

  @ApiProperty({ example: 20000, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  compareAt?: number;
}
