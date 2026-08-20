import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { PayoutProfilesService } from './payout-profiles.service';
import { CreatePayoutProfileDto } from './dto/create-payout-profile.dto';
import { UpdatePayoutProfileDto } from './dto/update-payout-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums';

@ApiTags('Fundraising')
@Controller('payout-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER, UserRole.ADMIN)
export class PayoutProfilesController {
  constructor(private readonly payoutProfilesService: PayoutProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'List my payout profiles' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'List of payout profiles' })
  async findAll(@CurrentUser() user: RequestUser) {
    return this.payoutProfilesService.findAllForUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payout profile by ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.payoutProfilesService.findOne(user.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create payout profile' })
  @ApiBody({ type: CreatePayoutProfileDto })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400 })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden — EMAIL_NOT_VERIFIED when the account must verify before managing payout details',
  })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePayoutProfileDto,
  ) {
    return this.payoutProfilesService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update payout profile' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdatePayoutProfileDto })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePayoutProfileDto,
  ) {
    return this.payoutProfilesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete payout profile' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.payoutProfilesService.remove(user.id, id);
  }
}
