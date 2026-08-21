import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../generated/prisma/enums';
import { isPayoutAutoExecuteEnabled } from '../payouts/payout-eligibility';
import { assertAutoExecuteModeAllowed } from '../payouts/payout-eligibility.helpers';

const SITE_SETTINGS_ID = 'default';

@ApiTags('Admin')
@Controller('admin/site-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSiteSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get site settings' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Site settings' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findOne() {
    const settings = await this.prisma.siteSettings.findUnique({
      where: { id: SITE_SETTINGS_ID },
    });
    if (!settings) {
      return {
        id: SITE_SETTINGS_ID,
        vatRate: 0,
        pricesIncludeVat: true,
        vatAppliesToShipping: true,
        currency: 'NGN',
        payoutMode: 'MANUAL',
        payoutCadenceDays: 7,
        payoutSettlementHoldDays: 7,
        minimumPayoutAmount: null,
        autoRetryFailedPayouts: true,
        createdAt: null,
        updatedAt: null,
      };
    }
    return {
      ...settings,
      vatRate: Number(settings.vatRate),
      minimumPayoutAmount:
        settings.minimumPayoutAmount != null
          ? Number(settings.minimumPayoutAmount)
          : null,
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update site settings' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Updated site settings' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async update(
    @Body() dto: UpdateSiteSettingsDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data: Record<string, unknown> = {};
    if (dto.vatRate !== undefined) data.vatRate = dto.vatRate;
    if (dto.pricesIncludeVat !== undefined)
      data.pricesIncludeVat = dto.pricesIncludeVat;
    if (dto.vatAppliesToShipping !== undefined)
      data.vatAppliesToShipping = dto.vatAppliesToShipping;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.payoutMode !== undefined) {
      assertAutoExecuteModeAllowed(
        dto.payoutMode,
        isPayoutAutoExecuteEnabled(process.env.PAYOUT_AUTO_EXECUTE_ENABLED),
      );
      data.payoutMode = dto.payoutMode;
    }
    if (dto.payoutCadenceDays !== undefined)
      data.payoutCadenceDays = dto.payoutCadenceDays;
    if (dto.payoutSettlementHoldDays !== undefined)
      data.payoutSettlementHoldDays = dto.payoutSettlementHoldDays;
    if (dto.minimumPayoutAmount !== undefined)
      data.minimumPayoutAmount = dto.minimumPayoutAmount;
    if (dto.autoRetryFailedPayouts !== undefined)
      data.autoRetryFailedPayouts = dto.autoRetryFailedPayouts;

    const before = await this.prisma.siteSettings.findUnique({
      where: { id: SITE_SETTINGS_ID },
    });
    const updated = await this.prisma.siteSettings.upsert({
      where: { id: SITE_SETTINGS_ID },
      create: {
        id: SITE_SETTINGS_ID,
        vatRate: dto.vatRate ?? 0,
        pricesIncludeVat: dto.pricesIncludeVat ?? true,
        vatAppliesToShipping: dto.vatAppliesToShipping ?? true,
        currency: (dto.currency ?? 'NGN') as 'NGN',
        payoutMode: dto.payoutMode ?? 'MANUAL',
        payoutCadenceDays: dto.payoutCadenceDays ?? 7,
        payoutSettlementHoldDays: dto.payoutSettlementHoldDays ?? 7,
        minimumPayoutAmount: dto.minimumPayoutAmount ?? null,
        autoRetryFailedPayouts: dto.autoRetryFailedPayouts ?? true,
      },
      update: data,
    });
    await this.audit.log({
      eventName: 'admin.site-settings.updated',
      action: AuditAction.UPDATE,
      entityType: 'SiteSettings',
      entityId: SITE_SETTINGS_ID,
      actorUserId: user.id,
      actorRole: user.role,
      before: before
        ? {
            ...before,
            vatRate: Number(before.vatRate),
            minimumPayoutAmount:
              before.minimumPayoutAmount != null
                ? Number(before.minimumPayoutAmount)
                : null,
          }
        : null,
      after: {
        ...updated,
        vatRate: Number(updated.vatRate),
        minimumPayoutAmount:
          updated.minimumPayoutAmount != null
            ? Number(updated.minimumPayoutAmount)
            : null,
      },
      note: 'Admin updated site settings',
    });
    return {
      ...updated,
      vatRate: Number(updated.vatRate),
      minimumPayoutAmount:
        updated.minimumPayoutAmount != null
          ? Number(updated.minimumPayoutAmount)
          : null,
    };
  }
}
