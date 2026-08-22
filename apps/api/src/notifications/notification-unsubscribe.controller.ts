import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationUnsubscribeDto } from './dto/notification-unsubscribe.dto';

@ApiTags('Notifications')
@Controller('notifications/unsubscribe')
export class NotificationUnsubscribeController {
  constructor(private readonly preferences: NotificationPreferenceService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
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
