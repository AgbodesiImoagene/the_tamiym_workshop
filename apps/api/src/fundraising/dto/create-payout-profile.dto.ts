import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreatePayoutProfileDto {
  @ApiProperty({ example: 'Personal' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ example: '058' })
  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @ApiProperty({ example: 'Account Name' })
  @IsString()
  @IsNotEmpty()
  accountName!: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @ApiProperty({ example: 'GTBank', required: false })
  @IsOptional()
  @IsString()
  bankName?: string;
}
