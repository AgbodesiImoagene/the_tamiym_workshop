import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  NotificationCategory,
  NotificationPreferenceChannel,
} from '../../generated/prisma/enums';

export class NotificationPreferenceItemDto {
  @ApiProperty({ enum: NotificationPreferenceChannel })
  @IsEnum(NotificationPreferenceChannel)
  channel!: NotificationPreferenceChannel;

  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}

export class GrantMarketingConsentDto {
  @ApiProperty({ enum: NotificationPreferenceChannel })
  @IsEnum(NotificationPreferenceChannel)
  channel!: NotificationPreferenceChannel;
}
