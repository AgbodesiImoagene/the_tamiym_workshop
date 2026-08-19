import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PayoutRunsService } from '../payouts/payout-runs.service';
import { CreatePayoutRunDto } from './dto/create-payout-run.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../generated/prisma/enums';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Admin')
@Controller('admin/payout-runs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPayoutRunsController {
  constructor(private readonly payoutRunsService: PayoutRunsService) {}

  @Get('preview')
  @ApiOperation({
    summary: 'Preview eligible campaigns and totals for a payout run',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'cutoffAt',
    required: false,
    description: 'ISO date for settlement cutoff',
  })
  @ApiResponse({
    status: 200,
    description: 'Preview with line items and total',
  })
  async preview(@Query('cutoffAt') cutoffAt?: string) {
    let asOf: Date | undefined;
    if (cutoffAt) {
      asOf = new Date(cutoffAt);
      if (isNaN(asOf.getTime())) {
        throw new BadRequestException(
          'cutoffAt must be a valid ISO 8601 date string',
        );
      }
    }
    return this.payoutRunsService.previewPayoutRun(asOf);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a payout run (DRAFT) from eligible balances',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 201, description: 'Payout run created' })
  @ApiResponse({ status: 400, description: 'No eligible campaigns' })
  async create(
    @Body() dto: CreatePayoutRunDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payoutRunsService.createPayoutRun(
      new Date(dto.scheduledFor),
      new Date(dto.cutoffAt),
      dto.mode,
      user.id,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List payout runs' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'EXECUTING',
      'COMPLETED',
      'CANCELLED',
    ],
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async list(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return this.payoutRunsService.listPayoutRuns({
      status: status as
        | 'DRAFT'
        | 'PENDING_APPROVAL'
        | 'APPROVED'
        | 'EXECUTING'
        | 'COMPLETED'
        | 'CANCELLED'
        | undefined,
      limit:
        parsedLimit != null && !isNaN(parsedLimit) ? parsedLimit : undefined,
      offset:
        parsedOffset != null && !isNaN(parsedOffset) ? parsedOffset : undefined,
    });
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a payout run (DRAFT -> APPROVED)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Run approved' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.payoutRunsService.approvePayoutRun(id, user.id);
  }

  @Post(':id/execute')
  @ApiOperation({
    summary: 'Execute an approved payout run (call Paystack for each payout)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Execution started or completed' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async execute(@Param('id') id: string) {
    return this.payoutRunsService.executePayoutRun(id);
  }

  @Post('payouts/:payoutId/retry')
  @ApiOperation({
    summary:
      'Retry a failed payout in a run (creates a new payout row; TTW-011)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'payoutId' })
  @ApiResponse({
    status: 200,
    description: 'New payout created and executed; returns the new payout id',
  })
  @ApiResponse({
    status: 400,
    description: 'Payout not failed or not in a run',
  })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async retryPayout(@Param('payoutId') payoutId: string) {
    return this.payoutRunsService.retryPayout(payoutId);
  }
}
