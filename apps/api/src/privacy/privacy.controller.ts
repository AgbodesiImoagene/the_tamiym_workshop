import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { clearAllAuthCookies } from '../auth/auth-cookies';
import { PrivacyRequestStatus } from '../generated/prisma/enums';
import { PrivacyReauthDto } from './dto/privacy-reauth.dto';
import { PrivacyService } from './privacy.service';

@ApiTags('Privacy')
@Controller('privacy')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth('JWT-auth')
@ApiCookieAuth('access_token')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('requests')
  @ApiOperation({ summary: 'List own privacy / DSAR requests' })
  @ApiResponse({
    status: 200,
    description: 'Privacy requests for the current user',
  })
  list(@CurrentUser() user: RequestUser) {
    return this.privacy.listForUser(user.id);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get one privacy request with action evidence' })
  @ApiResponse({ status: 200, description: 'Privacy request detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.privacy.getForUser(user.id, id);
  }

  @Post('export')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request a personal data export (password re-auth required)',
  })
  @ApiResponse({
    status: 201,
    description: 'Export request completed; download within TTL',
  })
  @ApiResponse({ status: 401, description: 'Re-authentication failed' })
  requestExport(
    @CurrentUser() user: RequestUser,
    @Body() body: PrivacyReauthDto,
  ) {
    return this.privacy.requestExport(user.id, body.password);
  }

  @Post('requests/:id/export')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Download a packaged export (password re-auth; TTL-bound)',
  })
  @ApiResponse({ status: 200, description: 'Export JSON payload' })
  @ApiResponse({ status: 410, description: 'Export expired' })
  downloadExport(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: PrivacyReauthDto,
  ) {
    return this.privacy.downloadExport(user.id, id, body.password);
  }

  @Post('erasure')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Close account and erase/anonymise personal data (password re-auth; blocked by open obligations)',
  })
  @ApiResponse({ status: 200, description: 'Erasure request result' })
  @ApiResponse({
    status: 403,
    description: 'PRIVACY_OPEN_OBLIGATIONS when commerce obligations remain',
  })
  async requestErasure(
    @CurrentUser() user: RequestUser,
    @Body() body: PrivacyReauthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.privacy.requestErasure(user.id, body.password);
    if (result.status === PrivacyRequestStatus.COMPLETED) {
      // Sessions already revoked server-side; clear browser cookies so the
      // closed account cannot present ambient credentials on the next request.
      clearAllAuthCookies(res);
    }
    return result;
  }

  @Post('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cancel a pending export or revoke an unexpired completed export',
  })
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.privacy.cancel(user.id, id);
  }
}
