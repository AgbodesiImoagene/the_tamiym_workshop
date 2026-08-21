import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums';
import { ANALYTICS_KPI_POLICY_VERSION } from './analytics-contract';

@ApiTags('Admin')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get analytics overview (admin)',
    description: `Versioned KPI overview (${ANALYTICS_KPI_POLICY_VERSION}). Filters: Lagos date window, campaign, product, order/payment status, channel, currency. Returns catalogue metrics + meta (definitionVersion, cutoff, freshness).`,
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Overview metrics with meta' })
  @ApiResponse({
    status: 400,
    description: 'Invalid filters / reversed window',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getOverview(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getOverview(query);
  }

  @Get('payouts')
  @ApiOperation({
    summary: 'Get payout overview metrics (admin)',
    description:
      'Subset of money-metrics (backward compatible). Prefer GET money-metrics for full snapshot.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Payout run and payout counts' })
  async getPayoutOverview() {
    return this.analyticsService.getPayoutOverview();
  }

  @Get('money-metrics')
  @ApiOperation({
    summary: 'Money-truth metrics (admin)',
    description:
      'Payout pipeline, gross cache vs ledger-eligible, paid-out value. Includes TTW-036 meta. Optional campaign/date filters apply to gross/paid-out/ledger slices.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Money metrics with meta' })
  async getMoneyMetrics(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getMoneyMetrics(query);
  }

  @Get('campaigns/:campaignId/snapshot')
  @ApiOperation({
    summary: 'Campaign fundraising snapshot (admin)',
    description:
      'Goal, gross currentAmount cache, ledger eligible balance, paid orders, last payout + meta.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'campaignId' })
  @ApiResponse({ status: 200, description: 'Campaign snapshot' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async getCampaignSnapshot(@Param('campaignId') campaignId: string) {
    return this.analyticsService.getCampaignFundraisingSnapshot(campaignId);
  }

  @Get('drilldowns/orders')
  @ApiOperation({
    summary: 'Drill-down: orders matching analytics filters (admin)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Paginated order rows + meta' })
  async drilldownOrders(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.drilldownOrders(query);
  }

  @Get('drilldowns/settlements')
  @ApiOperation({
    summary: 'Drill-down: succeeded payment settlements (admin)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async drilldownSettlements(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.drilldownSettlements(query);
  }

  @Get('drilldowns/refunds')
  @ApiOperation({
    summary: 'Drill-down: succeeded refunds (admin)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async drilldownRefunds(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.drilldownRefunds(query);
  }

  @Get('drilldowns/payouts')
  @ApiOperation({
    summary: 'Drill-down: succeeded payouts (admin)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async drilldownPayouts(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.drilldownPayouts(query);
  }

  @Get('drilldowns/reconciliation')
  @ApiOperation({
    summary: 'Drill-down: open/acknowledged reconciliation findings (admin)',
    description: 'Masked TTW-015 findings for KPI discrepancy investigation.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  async drilldownReconciliation(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.drilldownReconciliation(query);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export CSV (admin)',
    description:
      'entity=orders|campaigns required vocabulary; unknown entities rejected. Same filters as overview. Max 10_000 rows. Audited.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'CSV file' })
  @ApiResponse({ status: 400, description: 'Unknown entity / limit / filters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportCsv(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { entity, csv } = await this.analyticsService.exportCsv(
      query,
      user.id,
    );

    const filename = `${entity}-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
}
