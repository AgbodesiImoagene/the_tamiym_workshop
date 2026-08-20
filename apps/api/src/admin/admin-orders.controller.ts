import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
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
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { OrdersService } from '../orders/orders.service';
import { RefundsService } from '../orders/refunds.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums';

@ApiTags('Admin')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly refundsService: RefundsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all orders (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by order status',
  })
  @ApiResponse({ status: 200, description: 'List of orders' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@Query('status') status?: string) {
    return this.ordersService.findAllForAdmin(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOneForAdmin(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update order status (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(id, dto.status, user.id);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Initiate a provider refund (admin). Settles only after Paystack confirmation.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiBody({ type: CreateRefundDto })
  @ApiResponse({
    status: 200,
    description:
      'Refund reserved/initiated; financial effects apply on refund.processed',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid amount or order not refundable',
  })
  @ApiResponse({
    status: 409,
    description: 'Provider transient failure — retry with same idempotency key',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async refund(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
  ) {
    return this.refundsService.initiateRefund(
      id,
      dto.amount,
      dto.reason,
      user.id,
      dto.idempotencyKey,
    );
  }
}
