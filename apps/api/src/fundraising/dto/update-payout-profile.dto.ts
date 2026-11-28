import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

export class UpdatePayoutProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false })
  @IsOptionalStrictBoolean()
  isDefault?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Changing bank identity clears recipient codes, bumps destinationVersion, and requires re-verification (TTW-042). Existing payout snapshots are unaffected.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bankCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accountName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accountNumber?: string;
}
