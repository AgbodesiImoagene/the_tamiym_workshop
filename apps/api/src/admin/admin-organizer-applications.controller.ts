import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  OrganizerApplicationStatus,
  UserRole,
} from '../generated/prisma/enums';
import { OrganizerApplicationsService } from '../organizer/organizer-applications.service';
import { ApproveOrganizerApplicationDto } from '../organizer/dto/approve-organizer-application.dto';
import { RejectOrganizerApplicationDto } from '../organizer/dto/reject-organizer-application.dto';

@ApiTags('Admin')
@Controller('admin/organiser/applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOrganizerApplicationsController {
  constructor(private readonly applications: OrganizerApplicationsService) {}

  @Get()
  @ApiOperation({ summary: 'List organiser applications (admin queue)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OrganizerApplicationStatus,
  })
  @ApiResponse({ status: 200, description: 'Application queue' })
  list(@Query('status') status?: OrganizerApplicationStatus) {
    return this.applications.listForAdmin(status);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get organiser application detail (includes internal notes)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Application id' })
  @ApiResponse({ status: 200, description: 'Application detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(@Param('id') id: string) {
    return this.applications.getForAdmin(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a PENDING organiser application' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Application id' })
  @ApiResponse({ status: 200, description: 'Application approved' })
  @ApiResponse({ status: 403, description: 'Self-review blocked' })
  @ApiResponse({ status: 409, description: 'Not pending' })
  approve(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: ApproveOrganizerApplicationDto,
  ) {
    return this.applications.approve(actor.id, id, dto.internalNotes);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a PENDING organiser application' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Application id' })
  @ApiResponse({ status: 200, description: 'Application rejected' })
  @ApiResponse({ status: 403, description: 'Self-review blocked' })
  @ApiResponse({ status: 409, description: 'Not pending' })
  reject(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: RejectOrganizerApplicationDto,
  ) {
    return this.applications.reject(actor.id, id, dto);
  }
}
