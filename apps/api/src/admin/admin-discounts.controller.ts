import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { DiscountsService } from '../discounts/discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

@ApiTags('Admin')
@Controller('admin/discounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create discount (enforces one active per subject, fixed/percentage mutual exclusion)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 201, description: 'Discount created' })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed (e.g. currency required for FIXED, or conflict)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(@Body() dto: CreateDiscountDto) {
    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    if (startAt && !isFinite(startAt.getTime())) {
      throw new BadRequestException('startAt is not a valid date');
    }
    if (endAt && !isFinite(endAt.getTime())) {
      throw new BadRequestException('endAt is not a valid date');
    }
    return this.discountsService.create({
      code: dto.code,
      type: dto.type as 'PERCENTAGE' | 'FIXED' | 'BULK',
      scope: dto.scope as 'ORDER' | 'PRODUCT' | 'VARIANT' | 'CAMPAIGN',
      status: (dto.status as 'ACTIVE' | 'INACTIVE') ?? 'ACTIVE',
      valuePercent: dto.valuePercent,
      valueAmount: dto.valueAmount,
      currency: dto.currency ?? null,
      minOrderAmount: dto.minOrderAmount,
      startAt: startAt ?? null,
      endAt: endAt ?? null,
      maxRedemptions: dto.maxRedemptions ?? null,
      campaignIds: dto.campaignIds ?? [],
      productIds: dto.productIds ?? [],
      variantIds: dto.variantIds ?? [],
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all discounts (admin)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'List of discounts' })
  async findAll() {
    return this.discountsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get discount by id' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Discount ID' })
  @ApiResponse({ status: 200, description: 'Discount' })
  @ApiResponse({ status: 404, description: 'Discount not found' })
  async findOne(@Param('id') id: string) {
    return this.discountsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update discount (re-validates active rules)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Discount ID' })
  @ApiResponse({ status: 200, description: 'Discount updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Discount not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    const startAt = dto.startAt ? new Date(dto.startAt) : undefined;
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    if (startAt && !isFinite(startAt.getTime())) {
      throw new BadRequestException('startAt is not a valid date');
    }
    if (endAt && !isFinite(endAt.getTime())) {
      throw new BadRequestException('endAt is not a valid date');
    }
    return this.discountsService.update(id, {
      code: dto.code,
      status: dto.status as 'ACTIVE' | 'INACTIVE' | undefined,
      valuePercent: dto.valuePercent,
      valueAmount: dto.valueAmount,
      currency: dto.currency ?? undefined,
      minOrderAmount: dto.minOrderAmount,
      startAt: startAt ?? undefined,
      endAt: endAt ?? undefined,
      maxRedemptions: dto.maxRedemptions ?? undefined,
      campaignIds: dto.campaignIds,
      productIds: dto.productIds,
      variantIds: dto.variantIds,
    });
  }
}
