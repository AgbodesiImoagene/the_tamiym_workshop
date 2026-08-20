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
import { MediaService } from '../media/media.service';
import { ModerationActionDto } from '../designs/dto/moderation-action.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, ModerationStatus } from '../generated/prisma/enums';

@ApiTags('Admin')
@Controller('admin/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @ApiOperation({ summary: 'List media assets by moderation status (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ModerationStatus,
    description: 'Filter by moderation status',
  })
  @ApiResponse({ status: 200, description: 'List of media assets' })
  async findAll(@Query('status') status?: ModerationStatus) {
    return this.mediaService.adminFindAll(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media asset detail (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Media asset ID' })
  @ApiResponse({ status: 200, description: 'Media asset detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string) {
    return this.mediaService.adminFindOne(id);
  }

  @Patch(':id/moderation')
  @ApiOperation({ summary: 'Update media asset moderation status (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Media asset ID' })
  @ApiResponse({ status: 200, description: 'Moderation status updated' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async updateModeration(
    @Param('id') id: string,
    @Body() dto: ModerationActionDto,
  ) {
    return this.mediaService.adminUpdateModeration(id, dto.status, dto.notes);
  }
}
