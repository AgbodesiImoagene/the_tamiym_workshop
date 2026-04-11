import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { AdminNotificationRoutesService } from './admin-notification-routes.service';
import { CreateAdminNotificationRouteDto } from './dto/create-admin-notification-route.dto';
import { UpdateAdminNotificationRouteDto } from './dto/update-admin-notification-route.dto';

@ApiTags('Admin')
@Controller('admin/notification-routes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminNotificationRoutesController {
  constructor(private readonly routesService: AdminNotificationRoutesService) {}

  @Get('events')
  @ApiOperation({
    summary: 'List admin notification event keys and descriptions',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200 })
  eventCatalog() {
    return this.routesService.listEventCatalog();
  }

  @Get()
  @ApiOperation({ summary: 'List configured notification routes' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  findAll() {
    return this.routesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one route by id' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string) {
    return this.routesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a notification route' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  create(@Body() dto: CreateAdminNotificationRouteDto) {
    return this.routesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification route' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminNotificationRouteDto,
  ) {
    return this.routesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification route' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.routesService.remove(id);
  }
}
