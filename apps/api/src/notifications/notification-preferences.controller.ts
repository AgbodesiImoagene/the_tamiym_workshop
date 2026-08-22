import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { NotificationPreferenceService } from './notification-preference.service';
import {
  GrantMarketingConsentDto,
  UpdateNotificationPreferencesDto,
} from './dto/update-notification-preferences.dto';

@ApiTags('Users')
@Controller('users/notification-preferences')
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferenceService) {}

  @Get()
  @ApiOperation({
    summary: 'Get optional notification preferences (TTW-043)',
    description:
      'Returns mutable category/channel preferences. Required security/transactional notices are not listed as disableable.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Preference matrix' })
  async getPreferences(@CurrentUser() user: RequestUser) {
    return this.preferences.getPreferences(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update optional notification preferences' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: UpdateNotificationPreferencesDto })
  @ApiResponse({ status: 200, description: 'Updated preferences' })
  @ApiResponse({
    status: 400,
    description: 'Required category or missing marketing consent',
  })
  async updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.preferences.updatePreferences(user.id, dto.preferences);
  }

  @Post('marketing-consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record explicit marketing email/SMS consent before opt-in',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: GrantMarketingConsentDto })
  async grantMarketingConsent(
    @CurrentUser() user: RequestUser,
    @Body() dto: GrantMarketingConsentDto,
  ) {
    return this.preferences.grantMarketingConsent(user.id, dto.channel);
  }
}
