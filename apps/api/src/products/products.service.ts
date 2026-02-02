import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductsQueryDto } from './dto/products-query.dto';
import { ProductStatus } from '../generated/prisma/enums';
import { CurrencyCode } from '../generated/prisma/enums';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate URL-safe slug from name
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '');
  }

  /**
   * List products (public). Filter by category and availability; only ACTIVE products with available variants.
   */
  async findAll(query?: ProductsQueryDto) {
    const where: {
      status: typeof ProductStatus.ACTIVE;
      categoryId?: string;
      variants?: { some: { isAvailable: true } };
    } = {
      status: ProductStatus.ACTIVE,
    };
    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query?.available === true) {
      where.variants = { some: { isAvailable: true } };
    }

    return this.prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: {
          where: query?.available === true ? { isAvailable: true } : undefined,
          select: {
            id: true,
            name: true,
            sku: true,
            size: true,
            color: true,
            isAvailable: true,
          },
        },
        prices: {
          where: { currency: CurrencyCode.NGN },
          select: { amount: true, currency: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single product by ID (public). Includes variants and prices.
   */
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: {
          select: {
            id: true,
            name: true,
            sku: true,
            size: true,
            color: true,
            priceOverride: true,
            isAvailable: true,
          },
        },
        prices: { select: { currency: true, amount: true, compareAt: true } },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /**
   * Create a product (admin)
   */
  async create(dto: CreateProductDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException('Category not found');
    }
    const slug = dto.slug ?? this.slugify(dto.name);
    const existing = await this.prisma.product.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException(`Product with slug "${slug}" already exists`);
    }
    return this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        slug,
        description: dto.description,
        status: dto.status ?? ProductStatus.DRAFT,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Update a product (admin)
   */
  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const slug = dto.slug ?? (dto.name ? this.slugify(dto.name) : undefined);
    if (slug) {
      const existing = await this.prisma.product.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(
          `Product with slug "${slug}" already exists`,
        );
      }
    }
    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.name && { name: dto.name }),
        ...(slug && { slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Delete a product (admin)
   */
  async remove(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.prisma.product.delete({
      where: { id },
    });
  }

  /**
   * Add a variant to a product (admin)
   */
  async addVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const existingSku = await this.prisma.productVariant.findUnique({
      where: { sku: dto.sku },
    });
    if (existingSku) {
      throw new ConflictException(
        `Variant with SKU "${dto.sku}" already exists`,
      );
    }
    return this.prisma.productVariant.create({
      data: {
        productId,
        name: dto.name,
        sku: dto.sku,
        size: dto.size,
        color: dto.color,
        priceOverride: dto.priceOverride,
        isAvailable: dto.isAvailable ?? true,
      },
    });
  }

  /**
   * Update a variant (admin)
   */
  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    if (dto.sku) {
      const existing = await this.prisma.productVariant.findFirst({
        where: { sku: dto.sku, id: { not: variantId } },
      });
      if (existing) {
        throw new ConflictException(
          `Variant with SKU "${dto.sku}" already exists`,
        );
      }
    }
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.sku && { sku: dto.sku }),
        ...(dto.size !== undefined && { size: dto.size }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.priceOverride !== undefined && {
          priceOverride: dto.priceOverride,
        }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
      },
    });
  }

  /**
   * Remove a variant (admin)
   */
  async removeVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    return this.prisma.productVariant.delete({
      where: { id: variantId },
    });
  }
}
