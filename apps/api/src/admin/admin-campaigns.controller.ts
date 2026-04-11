import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { CampaignsService } from '../fundraising/campaigns.service';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';
import { UpdateCampaignPayoutPolicyDto } from './dto/update-campaign-payout-policy.dto';
import { RejectCampaignDto } from './dto/reject-campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole, CampaignStatus } from '../generated/prisma/enums';

@ApiTags('Admin')
@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * List campaigns, optionally filtered by status.
   * Use status=REVIEW to pull the human moderation review queue.
   */
  @Get()
  @ApiOperation({
    summary: 'List all campaigns (admin)',
    description:
      'Filter by status=REVIEW to see campaigns awaiting human review.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: CampaignStatus,
    description:
      'Filter by campaign status (use REVIEW for the moderation queue)',
  })
  @ApiResponse({ status: 200, description: 'List of campaigns' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@Query('status') status?: CampaignStatus) {
    return this.campaignsService.findAllForAdmin(status);
  }

  /**
   * Activate a campaign from REVIEW → ACTIVE.
   * Validates all attached designs are APPROVED before making the campaign live.
   */
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate campaign after review (REVIEW → ACTIVE)',
    description:
      'Requires all attached designs to be APPROVED. Campaign becomes publicly live after this call.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: 200, description: 'Campaign activated' })
  @ApiResponse({
    status: 400,
    description: 'Not in REVIEW status, or attached designs not yet approved',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async activate(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.campaignsService.activateForAdmin(id, user.id, user.role);
  }

  /**
   * Reject a campaign from REVIEW → DRAFT with a reason visible to the organiser.
   * The organiser may then edit and resubmit for review.
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject campaign after review (REVIEW → DRAFT)',
    description:
      'Returns the campaign to DRAFT with a rejection reason shown to the organiser.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: RejectCampaignDto })
  @ApiResponse({
    status: 200,
    description: 'Campaign rejected and returned to DRAFT',
  })
  @ApiResponse({ status: 400, description: 'Not in REVIEW status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectCampaignDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaignsService.rejectForAdmin(
      id,
      dto.rejectionReason,
      dto.notes,
      user.id,
      user.role,
    );
  }

  /**
   * General status update (DISABLED / PAUSED / ENDED transitions only).
   * Use /activate and /reject for the REVIEW → ACTIVE/DRAFT flow.
   */
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update campaign status (admin)',
    description:
      'For DISABLED, PAUSED, or ENDED transitions only. Use /activate and /reject for the review flow.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: 200, description: 'Campaign status updated' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.campaignsService.updateStatusForAdmin(
      id,
      dto.status,
      user.id,
      user.role,
    );
  }

  @Patch(':id/payout-policy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set or clear campaign payout mode override (admin only)',
    description:
      'Organizers cannot change payout mode. Send payoutModeOverride: null to use site default only.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: 200, description: 'Campaign payout policy updated' })
  @ApiResponse({
    status: 400,
    description:
      'Invalid payoutModeOverride value (must be MANUAL, AUTO_APPROVAL_REQUIRED, AUTO_EXECUTE, or null)',
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async updatePayoutPolicy(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignPayoutPolicyDto,
  ) {
    return this.campaignsService.updatePayoutPolicyForAdmin(
      id,
      dto.payoutModeOverride,
      actor.id,
    );
  }
}
