import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { BulkPricingService } from '../bulk-pricing/bulk-pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBulkPricingDto } from './dto/create-bulk-pricing.dto';
import { UpdateBulkPricingDto } from './dto/update-bulk-pricing.dto';

@ApiTags('Admin')
@Controller('admin/bulk-pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminBulkPricingController {
  constructor(
    private readonly bulkPricingService: BulkPricingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create bulk pricing tier (validates no overlap)' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 201, description: 'Tier created' })
  @ApiResponse({ status: 400, description: 'Overlap or invalid range' })
  async create(@Body() dto: CreateBulkPricingDto) {
    return this.bulkPricingService.create({
      productId: dto.productId,
      variantId: dto.variantId ?? null,
      currency: dto.currency,
      minQuantity: dto.minQuantity,
      maxQuantity: dto.maxQuantity ?? null,
      pricePerUnit: dto.pricePerUnit,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'List bulk pricing tiers (optional filter by productId)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiQuery({ name: 'productId', required: false })
  @ApiResponse({ status: 200, description: 'List of tiers' })
  async findAll(@Query('productId') productId?: string) {
    return this.prisma.bulkPricing.findMany({
      where: productId ? { productId } : undefined,
      orderBy: [
        { productId: 'asc' },
        { variantId: 'asc' },
        { currency: 'asc' },
        { minQuantity: 'asc' },
      ],
      include: {
        product: { select: { id: true, name: true, slug: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update bulk pricing tier (re-validates no overlap)',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Bulk pricing tier ID' })
  @ApiResponse({ status: 200, description: 'Tier updated' })
  @ApiResponse({ status: 400, description: 'Overlap or invalid range' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateBulkPricingDto) {
    return this.bulkPricingService.update(id, {
      minQuantity: dto.minQuantity,
      maxQuantity: dto.maxQuantity,
      pricePerUnit: dto.pricePerUnit,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete bulk pricing tier' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'Bulk pricing tier ID' })
  @ApiResponse({ status: 200, description: 'Tier deleted' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async remove(@Param('id') id: string) {
    await this.bulkPricingService.remove(id);
    return { deleted: true, id };
  }
}
