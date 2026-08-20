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
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { AdminUsersService } from './admin-users.service';
import { UpdateAdminUserRoleDto } from './dto/update-admin-user-role.dto';

@ApiTags('Admin')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Search users (admin)' })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Email or name substring',
  })
  @ApiQuery({ name: 'take', required: false, description: 'Max rows (1–100)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Matching users' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async search(@Query('q') q?: string, @Query('take') take?: string) {
    const n = take !== undefined && take !== '' ? Number(take) : 50;
    return this.adminUsers.searchUsers(q, Number.isFinite(n) ? n : 50);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change a user role (admin)' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Updated user' })
  @ApiResponse({ status: 400, description: 'Bad request (e.g. last admin)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adminUsers.setUserRole(user.id, user.role, id, dto.role);
  }
}
