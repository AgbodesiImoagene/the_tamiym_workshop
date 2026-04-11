import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PayoutsService } from '../payouts/payouts.service';
import { ApproveManualAdjustmentDto } from './dto/approve-manual-adjustment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../generated/prisma/enums';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Admin')
@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminManualPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post(':id/approve-manual')
  @ApiOperation({
    summary:
      'Approve and execute manual adjustment (second admin; requester cannot approve)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Payout ID' })
  @ApiResponse({
    status: 200,
    description: 'Manual adjustment approved and executed',
  })
  @ApiResponse({
    status: 400,
    description: 'Not a manual adjustment or wrong status',
  })
  @ApiResponse({
    status: 403,
    description: 'Requester cannot approve own request',
  })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async approveManualAdjustment(
    @Param('id') id: string,
    @Body() dto: ApproveManualAdjustmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.payoutsService.approveManualAdjustment(
      id,
      user.id,
      dto.approvalReason,
    );
  }
}
