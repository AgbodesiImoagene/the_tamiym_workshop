import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateAdminNotificationRouteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyEmail?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailRecipients?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifySms?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  smsRecipients?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifySlack?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  slackWebhookUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectTemplate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailBodyTemplate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  smsBodyTemplate?: string | null;
}
