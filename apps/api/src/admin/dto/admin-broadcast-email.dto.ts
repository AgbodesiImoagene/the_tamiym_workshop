import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';

export enum AdminEmailAudience {
  /** Verified email, role CUSTOMER, active, non-admin */
  VERIFIED_CUSTOMERS = 'VERIFIED_CUSTOMERS',
  /** Verified email, role ORGANIZER, active, non-admin */
  VERIFIED_ORGANIZERS = 'VERIFIED_ORGANIZERS',
  /** Verified customers and organizers only (excludes ADMIN) */
  VERIFIED_CUSTOMERS_AND_ORGANIZERS = 'VERIFIED_CUSTOMERS_AND_ORGANIZERS',
  /** Explicit user IDs (verified email, active; may include admins if listed) */
  USER_IDS = 'USER_IDS',
}

export class AdminBroadcastEmailDto {
  @ApiProperty({ enum: AdminEmailAudience })
  @IsEnum(AdminEmailAudience)
  audience!: AdminEmailAudience;

  @ApiPropertyOptional({
    description: 'Required when audience is USER_IDS',
    type: [String],
    maxItems: 5000,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  userIds?: string[];

  @ApiProperty({ example: 'Holiday shipping update', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    description:
      'HTML body (sanitized server-side). Use simple markup; scripts removed.',
    maxLength: 50000,
  })
  @IsString()
  @MaxLength(50000)
  htmlBody!: string;

  @ApiPropertyOptional({
    description:
      'If true, returns recipient count and sample emails only; no rows queued.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
