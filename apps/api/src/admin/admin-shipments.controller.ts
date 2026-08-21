import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums';
import { ShipmentsService } from '../shipments/shipments.service';
import { CreateShipmentDto } from '../shipments/dto/create-shipment.dto';
import { UpdateShipmentStatusDto } from '../shipments/dto/update-shipment-status.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post('orders/:orderId/shipments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create the active outbound shipment for an order (READY). Derives FULFILLED from PROCESSING.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: CreateShipmentDto })
  @ApiResponse({ status: 201, description: 'Shipment created' })
  @ApiResponse({ status: 400, description: 'Order not eligible' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 409,
    description: 'Active outbound shipment already exists',
  })
  create(
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateShipmentDto,
  ) {
    return this.shipments.createForOrder(orderId, dto, user.id);
  }

  @Get('orders/:orderId/shipments')
  @ApiOperation({ summary: 'List shipments for an order (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Shipments with event history' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  listForOrder(@Param('orderId') orderId: string) {
    return this.shipments.listForOrderAdmin(orderId);
  }

  @Get('shipments/:id')
  @ApiOperation({ summary: 'Get shipment detail including private notes' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Shipment ID' })
  @ApiResponse({ status: 200, description: 'Shipment' })
  @ApiResponse({ status: 404, description: 'Shipment not found' })
  get(@Param('id') id: string) {
    return this.shipments.getForAdmin(id);
  }

  @Patch('shipments/:id')
  @ApiOperation({
    summary:
      'Append a shipment status event (dispatch / progress / deliver / exception / cancel)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Shipment ID' })
  @ApiBody({ type: UpdateShipmentStatusDto })
  @ApiResponse({ status: 200, description: 'Shipment updated' })
  @ApiResponse({ status: 400, description: 'Invalid transition or evidence' })
  @ApiResponse({ status: 404, description: 'Shipment not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict (idempotency / tracking)',
  })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusDto,
  ) {
    return this.shipments.updateStatus(id, dto, user.id);
  }
}
