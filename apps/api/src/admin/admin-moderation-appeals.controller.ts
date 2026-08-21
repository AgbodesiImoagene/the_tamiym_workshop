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
import { ModerationAppealStatus, UserRole } from '../generated/prisma/enums';
import { ResolveAppealDto } from '../moderation/dto/resolve-appeal.dto';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';

@ApiTags('Admin')
@Controller('admin/moderation/appeals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminModerationAppealsController {
  constructor(private readonly decisions: ModerationDecisionService) {}

  @Get()
  @ApiOperation({ summary: 'List moderation appeals (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ModerationAppealStatus,
  })
  @ApiResponse({ status: 200, description: 'Appeal queue' })
  list(@Query('status') status?: ModerationAppealStatus) {
    return this.decisions.listAppealsForAdmin(status);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get appeal detail including internal decision evidence',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Appeal ID' })
  @ApiResponse({ status: 200, description: 'Appeal detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(@Param('id') id: string) {
    return this.decisions.getAppealForAdmin(id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve a PENDING appeal (UPHELD or OVERTURNED)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Appeal ID' })
  @ApiResponse({ status: 200, description: 'Appeal resolved' })
  @ApiResponse({
    status: 403,
    description: 'Reviewer independence violation',
  })
  resolve(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: ResolveAppealDto,
  ) {
    return this.decisions.resolveAppeal(actor.id, id, dto);
  }
}
