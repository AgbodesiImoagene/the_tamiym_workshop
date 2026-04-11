import {
  Controller,
  Get,
  Post,
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
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { QuoteRequestDto } from '../pricing/dto/quote-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly pricingService: PricingService,
  ) {}

  /**
   * Get a price quote for a standard order (no campaign). Does not create an order.
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order quote (standard)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: QuoteRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Quote with line items, shipping, VAT, and total',
  })
  @ApiResponse({ status: 400, description: 'Invalid input or address' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async quote(@CurrentUser() user: RequestUser, @Body() dto: QuoteRequestDto) {
    return this.pricingService.quoteStandard(user.id, dto);
  }

  /**
   * Create an order (PENDING_PAYMENT)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an order' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or insufficient stock',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.id, createOrderDto);
  }

  /**
   * List current user's orders
   */
  @Get()
  @ApiOperation({ summary: 'List my orders' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'List of orders' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: RequestUser) {
    return this.ordersService.findAll(user.id);
  }

  /**
   * Get an order by ID (own only)
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Order' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ordersService.findOne(user.id, id);
  }

  /**
   * Initiate Paystack payment for an order
   */
  @Post(':id/initiate-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate payment for order' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiBody({ type: InitiatePaymentDto })
  @ApiResponse({ status: 200, description: 'Authorization URL and reference' })
  @ApiResponse({ status: 400, description: 'Invalid order or payment config' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async initiatePayment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(
      id,
      user.id,
      dto.customerEmail ?? undefined,
    );
  }
}
