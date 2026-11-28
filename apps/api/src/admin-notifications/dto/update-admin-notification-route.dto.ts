import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

export class UpdateAdminNotificationRouteDto {
  @ApiPropertyOptional()
  @IsOptionalStrictBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptionalStrictBoolean()
  notifyEmail?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailRecipients?: string[];

  @ApiPropertyOptional()
  @IsOptionalStrictBoolean()
  notifySms?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  smsRecipients?: string[];

  @ApiPropertyOptional()
  @IsOptionalStrictBoolean()
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
