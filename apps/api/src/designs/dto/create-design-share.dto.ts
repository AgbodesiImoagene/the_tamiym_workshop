import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import {
  DESIGN_SHARE_ALLOWED_TTL_DAYS,
  DESIGN_SHARE_DEFAULT_TTL_DAYS,
} from '../design-share.constants';

export class CreateDesignShareDto {
  @ApiPropertyOptional({
    enum: DESIGN_SHARE_ALLOWED_TTL_DAYS,
    default: DESIGN_SHARE_DEFAULT_TTL_DAYS,
  })
  @IsOptional()
  @IsInt()
  @IsIn([...DESIGN_SHARE_ALLOWED_TTL_DAYS])
  ttlDays?: number;
}
