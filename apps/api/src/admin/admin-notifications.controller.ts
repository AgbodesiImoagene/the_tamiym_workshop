import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums';
import {
  ADMIN_EMAIL_BROADCAST_THROTTLE_LIMIT,
  ADMIN_EMAIL_BROADCAST_THROTTLE_TTL_MS,
} from '../constants';
import { AdminEmailBroadcastService } from './admin-email-broadcast.service';
import { AdminBroadcastEmailDto } from './dto/admin-broadcast-email.dto';

@ApiTags('Admin')
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles(UserRole.ADMIN)
export class AdminNotificationsController {
  constructor(
    private readonly adminEmailBroadcast: AdminEmailBroadcastService,
  ) {}

  @Post('email/broadcast')
  @Throttle({
    default: {
      limit: ADMIN_EMAIL_BROADCAST_THROTTLE_LIMIT,
      ttl: ADMIN_EMAIL_BROADCAST_THROTTLE_TTL_MS,
    },
  })
  @ApiOperation({
    summary: 'Queue a custom HTML email to a verified-user segment',
    description:
      'Creates one notification_outbox row per recipient and enqueues mail delivery. Use dryRun first. Subject to hourly rate limit.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: AdminBroadcastEmailDto })
  @ApiResponse({ status: 201, description: 'Preview or queued send result' })
  async broadcastEmail(
    @Body() dto: AdminBroadcastEmailDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adminEmailBroadcast.execute(dto, user.id);
  }
}
