import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
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
import { DesignsService } from '../designs/designs.service';
import { ModerationActionDto } from '../designs/dto/moderation-action.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { ModerationStatus } from '../generated/prisma/enums';

@ApiTags('Admin')
@Controller('admin/designs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDesignsController {
  constructor(private readonly designsService: DesignsService) {}

  @Get()
  @ApiOperation({ summary: 'List designs by moderation status (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ModerationStatus,
    description: 'Filter by moderation status',
  })
  @ApiResponse({ status: 200, description: 'List of designs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@Query('status') status?: ModerationStatus) {
    return this.designsService.findAllByModerationStatus(status);
  }

  @Patch(':id/moderation')
  @ApiOperation({ summary: 'Update design moderation status (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Design ID' })
  @ApiResponse({ status: 200, description: 'Design moderation updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Design not found' })
  async updateModeration(
    @Param('id') id: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.designsService.updateModeration(id, dto.status);
  }
}
