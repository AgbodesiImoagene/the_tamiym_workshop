import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PayoutProfileStatus, UserRole } from '../generated/prisma/enums';
import { PayoutProfilesService } from '../fundraising/payout-profiles.service';

class AdminUpdatePayoutProfileStatusDto {
  @ApiProperty({
    enum: PayoutProfileStatus,
    description:
      'VERIFIED required for selection. SUSPENDED/REJECTED block payouts. SUPERSEDED is for superseded destinations.',
  })
  @IsEnum(PayoutProfileStatus)
  status!: PayoutProfileStatus;
}

@ApiTags('Admin')
@Controller('admin/payout-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPayoutProfilesController {
  constructor(private readonly payoutProfiles: PayoutProfilesService) {}

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set payout profile lifecycle status (TTW-042 interim verify/suspend)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  @ApiBody({ type: AdminUpdatePayoutProfileStatusDto })
  @ApiResponse({ status: 200, description: 'Updated payout profile' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async setStatus(
    @Param('id') id: string,
    @Body() dto: AdminUpdatePayoutProfileStatusDto,
  ) {
    return this.payoutProfiles.adminSetStatus(id, dto.status);
  }
}
