import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { PayoutsService } from '../payouts/payouts.service';
import { InitiatePayoutDto } from './dto/initiate-payout.dto';
import { RequestManualAdjustmentDto } from './dto/request-manual-adjustment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../generated/prisma/enums';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Admin')
@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post(':campaignId/payouts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate payout for a campaign (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'campaignId' })
  @ApiBody({ type: InitiatePayoutDto })
  @ApiResponse({ status: 201, description: 'Payout initiated' })
  @ApiResponse({
    status: 400,
    description: 'Invalid amount or no payout profile',
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async initiatePayout(
    @Param('campaignId') campaignId: string,
    @Body() dto: InitiatePayoutDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payoutsService.initiatePayout(
      campaignId,
      dto.amount,
      dto.reason,
      user.id,
    );
  }

  @Post(':campaignId/payouts/manual-adjustment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Request off-ledger manual adjustment (requires second admin approval)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'campaignId' })
  @ApiBody({ type: RequestManualAdjustmentDto })
  @ApiResponse({ status: 201, description: 'Manual adjustment requested' })
  @ApiResponse({
    status: 400,
    description: 'Invalid amount or no payout profile',
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async requestManualAdjustment(
    @Param('campaignId') campaignId: string,
    @Body() dto: RequestManualAdjustmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payoutsService.requestManualAdjustment(
      campaignId,
      dto.amount,
      dto.reason,
      user.id,
    );
  }
}
