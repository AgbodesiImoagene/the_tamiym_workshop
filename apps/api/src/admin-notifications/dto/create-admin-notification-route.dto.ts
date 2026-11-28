import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsOptionalStrictBoolean } from '../../common/boolean-fields.decorator';

export class CreateAdminNotificationRouteDto {
  @ApiProperty({ example: 'admin.order.placed' })
  @IsString()
  @MaxLength(128)
  eventKey!: string;

  @ApiPropertyOptional({ default: 'default', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptionalStrictBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptionalStrictBoolean()
  notifyEmail?: boolean;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailRecipients?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptionalStrictBoolean()
  notifySms?: boolean;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  smsRecipients?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptionalStrictBoolean()
  notifySlack?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  slackWebhookUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Handlebars subject; omit to use built-in default for eventKey',
  })
  @IsOptional()
  @IsString()
  subjectTemplate?: string | null;

  @ApiPropertyOptional({
    description: 'Handlebars HTML body; omit to use built-in default',
  })
  @IsOptional()
  @IsString()
  emailBodyTemplate?: string | null;

  @ApiPropertyOptional({
    description: 'Handlebars SMS body; omit to use built-in default',
  })
  @IsOptional()
  @IsString()
  smsBodyTemplate?: string | null;
}
