import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationUnsubscribeDto } from './dto/notification-unsubscribe.dto';

@ApiTags('Notifications')
@Controller('notifications/unsubscribe')
@UseGuards(ThrottlerGuard)
export class NotificationUnsubscribeController {
  constructor(private readonly preferences: NotificationPreferenceService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Apply signed unsubscribe token (optional categories only)',
    description:
      'Public endpoint using HMAC token — no session required. Returns generic success to avoid user enumeration.',
  })
  @ApiBody({ type: NotificationUnsubscribeDto })
  @ApiResponse({ status: 200, description: 'Unsubscribe applied' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async unsubscribe(@Body() dto: NotificationUnsubscribeDto) {
    return this.preferences.applyUnsubscribeToken(dto.token);
  }
}
