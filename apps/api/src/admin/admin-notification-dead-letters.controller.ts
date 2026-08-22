import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  DeadLetterAckStatus,
  NotificationChannel,
  UserRole,
} from '../generated/prisma/enums';
import { NotificationDeadLetterService } from '../notifications/notification-dead-letter.service';
import {
  DeadLetterAcknowledgeDto,
  DeadLetterBulkReplayDto,
  DeadLetterReplayDto,
} from '../notifications/dto/dead-letter-replay.dto';

@ApiTags('Admin')
@Controller('admin/notification-dead-letters')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles(UserRole.ADMIN)
export class AdminNotificationDeadLettersController {
  constructor(private readonly deadLetters: NotificationDeadLetterService) {}

  @Get()
  @ApiOperation({ summary: 'List failed notification dead letters (redacted)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({ name: 'channel', required: false, enum: NotificationChannel })
  @ApiQuery({ name: 'eventName', required: false })
  @ApiQuery({ name: 'ackStatus', required: false, enum: DeadLetterAckStatus })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  async list(
    @Query('channel') channel?: NotificationChannel,
    @Query('eventName') eventName?: string,
    @Query('ackStatus') ackStatus?: DeadLetterAckStatus,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.deadLetters.listDeadLetters({
      channel,
      eventName,
      ackStatus,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dead-letter detail with attempt history' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  async get(@Param('id') id: string) {
    return this.deadLetters.getDeadLetter(id);
  }

  @Post('replay/bulk')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Replay up to 25 dead letters with one reason' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: DeadLetterBulkReplayDto })
  async bulkReplay(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeadLetterBulkReplayDto,
  ) {
    return this.deadLetters.replayDeadLettersBulk(dto.ids, user.id, dto.reason);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge a dead letter' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  @ApiBody({ type: DeadLetterAcknowledgeDto })
  async acknowledge(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: DeadLetterAcknowledgeDto,
  ) {
    return this.deadLetters.acknowledgeDeadLetter(id, user.id, dto.note);
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Replay a failed notification as a new generation',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  @ApiBody({ type: DeadLetterReplayDto })
  async replay(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: DeadLetterReplayDto,
  ) {
    return this.deadLetters.replayDeadLetter(id, user.id, dto.reason);
  }
}
