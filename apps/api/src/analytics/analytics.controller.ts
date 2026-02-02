import {
  Controller,
  Get,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';

@ApiTags('Admin')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get analytics overview (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date (ISO)',
  })
  @ApiQuery({ name: 'dateTo', required: false, description: 'End date (ISO)' })
  @ApiResponse({ status: 200, description: 'Overview metrics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getOverview(@Query() query: AnalyticsQueryDto) {
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
    return this.analyticsService.getOverview(dateFrom, dateTo);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export CSV (admin). Use ?entity=orders or ?entity=campaigns',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'entity',
    enum: ['orders', 'campaigns'],
    description: 'Entity to export',
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiResponse({ status: 200, description: 'CSV file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportCsv(
    @Query() query: AnalyticsQueryDto & { entity?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
    const entity = query.entity ?? 'orders';

    const csv =
      entity === 'campaigns'
        ? await this.analyticsService.exportCampaignsCsv(dateFrom, dateTo)
        : await this.analyticsService.exportOrdersCsv(dateFrom, dateTo);

    const filename = `${entity}-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
}
