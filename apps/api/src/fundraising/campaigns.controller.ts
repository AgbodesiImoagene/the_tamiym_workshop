import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
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
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignBasicsDto } from './dto/update-campaign-basics.dto';
import {
  AddCampaignOfferDto,
  UpdateCampaignOfferDto,
  RemoveCampaignOfferDto,
} from './dto/campaign-offer.dto';
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

  @Get(':id/preview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Owner DRAFT preview (TTW-031 shape, watermarked, non-purchasable)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: 200, description: 'Draft preview payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async preview(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.campaignsService.getOwnerDraftPreview(user.id, id);
  }

  @Get(':id/price-guidance')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Minimum selling-price guidance (no cost leak)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiQuery({ name: 'productId', required: true })
  @ApiQuery({ name: 'designId', required: true })
  @ApiResponse({
    status: 200,
    description: 'Currency + minimumPrice + guidance',
  })
  @ApiResponse({ status: 400, description: 'Invalid product/design' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async priceGuidance(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('productId') productId: string,
    @Query('designId') designId: string,
  ) {
    return this.campaignsService.getPriceGuidance(
      user.id,
      id,
      productId,
      designId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get owned campaign detail (offers + price guidance + revision)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiResponse({ status: 200, description: 'Owner campaign detail' })
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
  @ApiOperation({
    summary: 'Update owned DRAFT campaign basics (expectedRevision required)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: UpdateCampaignBasicsDto })
  @ApiResponse({ status: 200, description: 'Campaign updated' })
  @ApiResponse({ status: 400, description: 'Invalid input / not DRAFT' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @ApiResponse({
    status: 409,
    description: 'Stale revision (CAMPAIGN_STALE_REVISION) or slug taken',
  })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() updateCampaignDto: UpdateCampaignBasicsDto,
  ) {
    return this.campaignsService.update(user.id, id, updateCampaignDto);
  }

  @Post(':id/offers')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Add campaign offer (product + owned design + price) atomically',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiBody({ type: AddCampaignOfferDto })
  @ApiResponse({
    status: 201,
    description: 'Offer added; returns owner detail',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation / floor / ownership failure',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @ApiResponse({
    status: 409,
    description: 'Stale revision or duplicate offer',
  })
  async addOffer(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AddCampaignOfferDto,
  ) {
    return this.campaignsService.addOffer(id, user.id, dto);
  }

  @Patch(':id/offers/:offerId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update campaign offer atomically' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiParam({ name: 'offerId', description: 'Campaign product (offer) ID' })
  @ApiBody({ type: UpdateCampaignOfferDto })
  @ApiResponse({
    status: 200,
    description: 'Offer updated; returns owner detail',
  })
  @ApiResponse({ status: 400, description: 'Validation failure' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @ApiResponse({
    status: 409,
    description: 'Stale revision or duplicate offer',
  })
  async updateOffer(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('offerId') offerId: string,
    @Body() dto: UpdateCampaignOfferDto,
  ) {
    return this.campaignsService.updateOffer(id, offerId, user.id, dto);
  }

  @Delete(':id/offers/:offerId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove campaign offer atomically' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Campaign ID' })
  @ApiParam({ name: 'offerId', description: 'Campaign product (offer) ID' })
  @ApiBody({ type: RemoveCampaignOfferDto })
  @ApiResponse({
    status: 200,
    description: 'Offer removed; returns owner detail',
  })
  @ApiResponse({ status: 400, description: 'Offer not found / not DRAFT' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @ApiResponse({ status: 409, description: 'Stale revision' })
  async removeOffer(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('offerId') offerId: string,
    @Body() dto: RemoveCampaignOfferDto,
  ) {
    return this.campaignsService.removeOffer(id, offerId, user.id, dto);
  }

  /**
   * @deprecated Prefer POST /campaigns/:id/offers
   */
  @Post(':id/products')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Add product to campaign (deprecated — use POST :id/offers)',
    deprecated: true,
  })
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
  @ApiResponse({
    status: 403,
    description:
      'Forbidden — EMAIL_NOT_VERIFIED when the account must verify before ordering',
  })
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
    description: 'Not in DRAFT status, missing fields, or interim blockers',
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
