import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { OrganizerApplicationsService } from './organizer-applications.service';
import { SubmitOrganizerApplicationDto } from './dto/submit-organizer-application.dto';

@ApiTags('Organiser applications')
@Controller('organiser/applications')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth('JWT-auth')
@ApiCookieAuth('access_token')
export class OrganizerApplicationsController {
  constructor(private readonly applications: OrganizerApplicationsService) {}

  @Get('eligibility')
  @ApiOperation({ summary: 'Get organiser application eligibility and status' })
  @ApiResponse({
    status: 200,
    description: 'Eligibility and latest application',
  })
  getEligibility(@CurrentUser() user: RequestUser) {
    return this.applications.getEligibility(user.id);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get latest organiser application status' })
  @ApiResponse({ status: 200, description: 'Latest application status' })
  getStatus(@CurrentUser() user: RequestUser) {
    return this.applications.getStatus(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit an organiser application' })
  @ApiResponse({ status: 201, description: 'Application created' })
  @ApiResponse({ status: 400, description: 'Not eligible / terms mismatch' })
  @ApiResponse({
    status: 409,
    description: 'Pending application already exists',
  })
  submit(
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitOrganizerApplicationDto,
  ) {
    return this.applications.submit(user.id, dto);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Withdraw a PENDING organiser application' })
  @ApiParam({ name: 'id', description: 'Application id' })
  @ApiResponse({ status: 200, description: 'Application withdrawn' })
  @ApiResponse({ status: 404, description: 'Pending application not found' })
  withdraw(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.applications.withdraw(user.id, id);
  }
}
