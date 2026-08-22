import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class NotificationUnsubscribeDto {
  @ApiProperty({
    description:
      'Signed unsubscribe token from email footer (HMAC, scoped, expiring).',
  })
  @IsString()
  @MinLength(16)
  token!: string;
}
