import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

export class UpdateShippingZoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptionalStrictBoolean()
  isActive?: boolean;
}
