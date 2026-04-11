import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
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
import { CampaignsService } from './campaigns.service';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { AddCampaignProductDto } from './dto/add-campaign-product.dto';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { QuoteRequestDto } from '../pricing/dto/quote-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums';

@ApiTags('Fundraising')
@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly ordersService: OrdersService,
    private readonly pricingService: PricingService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a campaign' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: CreateCampaignDto })
  @ApiResponse({ status: 201, description: 'Campaign created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: ORGANIZER or ADMIN only',
  })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() createCampaignDto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(user.id, createCampaignDto);
  }

  @Get()
  @ApiOperation({ summary: 'List my campaigns' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'List of campaigns' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: RequestUser) {
    return this.campaignsService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: 200, description: 'Campaign' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.campaignsService.findOne(user.id, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update campaign' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: UpdateCampaignDto })
  @ApiResponse({ status: 200, description: 'Campaign updated' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() updateCampaignDto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(user.id, id, updateCampaignDto);
  }

  @Post(':id/products')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Add product to campaign' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: AddCampaignProductDto })
  @ApiResponse({ status: 201, description: 'Product added' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async addProduct(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AddCampaignProductDto,
  ) {
    return this.campaignsService.addProduct(id, user.id, dto);
  }

  /**
   * List orders for this campaign (organizer only). Redacted: no buyer PII; includes status, dates, line items, and organizer economics.
   */
  @Get(':id/orders')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List campaign orders (organizer)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: 200, description: 'List of orders (redacted)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async getCampaignOrders(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.findOrdersByCampaignForOrganizer(id, user.id);
  }

  /**
   * Get a price quote for a campaign order. All items are priced via campaign product prices. Does not create an order.
   */
  @Post(':id/orders/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get campaign order quote' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: QuoteRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Quote with line items, shipping, VAT, and total',
  })
  @ApiResponse({ status: 400, description: 'Invalid input or address' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async quoteCampaignOrder(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: QuoteRequestDto,
  ) {
    return this.pricingService.quoteCampaign(user.id, id, dto);
  }

  /**
   * Create a campaign order (PENDING_PAYMENT). All items must belong to this campaign. Reserves inventory; supports idempotency.
   */
  @Post(':id/orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create campaign order' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or insufficient stock',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async createCampaignOrder(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createCampaignOrder(id, user.id, dto);
  }

  /**
   * Submit a campaign for admin review (DRAFT → REVIEW).
   * Triggers AI moderation on the campaign text. Auto-rejects obvious violations;
   * otherwise moves to REVIEW for human approval. Products/designs are locked after this call.
   */
  @Post(':id/submit-for-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit campaign for admin review (DRAFT → REVIEW)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({
    status: 200,
    description: 'Campaign submitted for review or auto-rejected',
  })
  @ApiResponse({
    status: 400,
    description: 'Not in DRAFT status or missing required fields',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async submitForReview(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.campaignsService.submitForReview(id, user.id);
  }
}
