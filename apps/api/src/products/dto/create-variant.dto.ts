import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

export class CreateVariantDto {
  @ApiProperty({ example: 'Small / Red' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'SKU-TEE-S-RED' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: true, required: false })
  @IsOptionalStrictBoolean()
  isAvailable?: boolean;
}
