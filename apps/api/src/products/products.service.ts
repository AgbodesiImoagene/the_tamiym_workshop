import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import {
  ProductsQueryDto,
  ProductSort,
  DEFAULT_LIMIT,
} from './dto/products-query.dto';
import { CreateOptionDto } from './dto/create-option.dto';
import { UpdateOptionDto } from './dto/update-option.dto';
import { CreateOptionValueDto } from './dto/create-option-value.dto';
import { UpdateOptionValueDto } from './dto/update-option-value.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { CreateProductImageUploadDto } from './dto/create-product-image-upload.dto';
import { CreateProductImageRoleDto } from './dto/create-product-image-role.dto';
import { UpdateProductImageRoleDto } from './dto/update-product-image-role.dto';
import { CreateProductViewDto } from './dto/create-product-view.dto';
import { UpdateProductViewDto } from './dto/update-product-view.dto';
import { CreatePrintAreaDto } from './dto/create-print-area.dto';
import { UpdatePrintAreaDto } from './dto/update-print-area.dto';
import { CreateTemplateLayerDto } from './dto/create-template-layer.dto';
import { UpdateTemplateLayerDto } from './dto/update-template-layer.dto';
import { CreateTemplateEffectDto } from './dto/create-template-effect.dto';
import { UpdateTemplateEffectDto } from './dto/update-template-effect.dto';
import { CreateProductPriceDto } from './dto/create-product-price.dto';
import { UpdateProductPriceDto } from './dto/update-product-price.dto';
import { CreateVariantPriceDto } from './dto/create-variant-price.dto';
import { UpdateVariantPriceDto } from './dto/update-variant-price.dto';
import {
  DEFAULT_CURRENCY,
  MAX_OPTIONS_PER_PRODUCT,
  MAX_VARIANTS_PER_PRODUCT,
} from '../constants';
import {
  BlendMode,
  ImageRole,
  MediaDerivativeType,
  ProductStatus,
  TemplateEffectType,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';

type UploadedImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
};

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private mediaService: MediaService,
  ) {}

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

  private attachImageUrl<
    T extends {
      mediaAsset?: {
        derivatives: { type: MediaDerivativeType; url: string }[];
      } | null;
    },
  >(image: T, preferred: MediaDerivativeType) {
    const url = this.resolveImageUrl(image.mediaAsset?.derivatives, preferred);
    const { mediaAsset, mediaAssetId, ...rest } = image as T & {
      mediaAssetId?: string;
    };
    void mediaAsset;
    void mediaAssetId;
    return {
      ...rest,
      url,
    };
  }

  private resolveImageUrl(
    derivatives: { type: MediaDerivativeType; url: string }[] | undefined,
    preferred: MediaDerivativeType,
  ): string | null {
    if (!derivatives || derivatives.length === 0) {
      return null;
    }
    const byType = new Map(
      derivatives.map((derivative) => [derivative.type, derivative.url]),
    );
    if (preferred === MediaDerivativeType.THUMB) {
      return (
        byType.get(MediaDerivativeType.THUMB) ??
        byType.get(MediaDerivativeType.DISPLAY) ??
        byType.get(MediaDerivativeType.ORIGINAL) ??
        null
      );
    }
    return (
      byType.get(MediaDerivativeType.DISPLAY) ??
      byType.get(MediaDerivativeType.ORIGINAL) ??
      byType.get(MediaDerivativeType.THUMB) ??
      null
    );
  }

  private buildVariantKey(
    optionIds: string[],
    optionValueMap: Map<string, string>,
  ): string {
    return optionIds
      .map((optionId) => `${optionId}:${optionValueMap.get(optionId) ?? ''}`)
      .join('|');
  }

  private cartesianProduct<T>(items: T[][]): T[][] {
    if (items.length === 0) {
      return [];
    }
    return items.reduce<T[][]>(
      (acc, values) =>
        acc.flatMap((prefix) => values.map((value) => [...prefix, value])),
      [[]],
    );
  }

  private generateUniqueSku(base: string, existing: Set<string>): string {
    let candidate = base;
    let suffix = 2;
    while (existing.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    existing.add(candidate);
    return candidate;
  }

  /**
   * List products (public). Slim response for catalogue: category, base price (NGN), thumbnail.
   * Filter by category (id or slug), availability, search, price range, on-sale; sort and paginate.
   */
  async findAll(query?: ProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
    };
    let categoryId: string | undefined = query?.categoryId;
    if (!categoryId && query?.categorySlug) {
      const category = await this.prisma.category.findUnique({
        where: { slug: query.categorySlug },
        select: { id: true },
      });
      if (category) categoryId = category.id;
      // If slug not found, categoryId stays undefined and we don't filter by category
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (query?.available === true) {
      where.variants = { some: { isAvailable: true } };
    }
    const searchTerm =
      typeof query?.search === 'string' ? query.search.trim() : '';
    if (searchTerm) {
      // Format for PostgreSQL FTS: split into words, join with | (OR). Only allow word chars to avoid tsquery injection.
      const words = searchTerm
        .split(/\s+/)
        .map((w) => w.replace(/[^\w-]/g, ''))
        .filter(Boolean);
      if (words.length > 0) {
        const ftsQuery = words.join(' | ');
        where.OR = [
          { name: { search: ftsQuery } },
          { description: { search: ftsQuery } },
        ];
      }
    }

    const minPrice = query?.minPrice;
    const maxPrice = query?.maxPrice;
    const needPriceFilter =
      minPrice != null || maxPrice != null || query?.onSale === true;
    if (needPriceFilter) {
      const priceConditions: Prisma.ProductPriceWhereInput = {
        currency: DEFAULT_CURRENCY,
      };
      if (minPrice != null && maxPrice != null) {
        priceConditions.amount = { gte: minPrice, lte: maxPrice };
      } else if (minPrice != null) {
        priceConditions.amount = { gte: minPrice };
      } else if (maxPrice != null) {
        priceConditions.amount = { lte: maxPrice };
      }
      if (query?.onSale === true) {
        priceConditions.compareAt = { not: null };
      }
      where.prices = { some: priceConditions };
    }

    const sort: ProductSort = query?.sort ?? ProductSort.NEWEST;
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === ProductSort.OLDEST
        ? { createdAt: 'asc' }
        : sort === ProductSort.NAME_ASC
          ? { name: 'asc' }
          : sort === ProductSort.NAME_DESC
            ? { name: 'desc' }
            : { createdAt: 'desc' };

    const limit = Math.min(query?.limit ?? DEFAULT_LIMIT, 100);
    const offset = query?.offset ?? 0;

    const products = await this.prisma.product.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        prices: {
          where: { currency: DEFAULT_CURRENCY },
          select: { amount: true, currency: true, compareAt: true },
        },
        productImageRoles: {
          where: { role: ImageRole.THUMBNAIL },
          take: 1,
          orderBy: { sortOrder: 'asc' },
          select: {
            image: {
              select: {
                id: true,
                mediaAssetId: true,
                altText: true,
                mediaAsset: {
                  select: {
                    status: true,
                    derivatives: { select: { type: true, url: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return products.map((product) => ({
      ...product,
      productImageRoles: product.productImageRoles.map((role) => ({
        ...role,
        image: role.image
          ? this.attachImageUrl(role.image, MediaDerivativeType.THUMB)
          : null,
      })),
    }));
  }

  /**
   * Get a single product by ID (public). Includes variants and prices.
   * Only returns ACTIVE products; inactive/draft products are not visible to
   * public callers. Admin callers should use the admin findOne variant.
   */
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id, status: ProductStatus.ACTIVE },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        options: {
          select: {
            id: true,
            code: true,
            name: true,
            sortOrder: true,
            values: {
              select: {
                id: true,
                valueCode: true,
                displayName: true,
                metadata: true,
                sortOrder: true,
                upcharges: {
                  select: { currency: true, amount: true },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        variants: {
          select: {
            id: true,
            name: true,
            sku: true,
            isAvailable: true,
            inventory: {
              select: {
                stockOnHand: true,
                reserved: true,
                trackInventory: true,
              },
            },
            optionValues: {
              select: {
                option: { select: { code: true, name: true } },
                optionValue: {
                  select: {
                    valueCode: true,
                    displayName: true,
                    metadata: true,
                  },
                },
              },
            },
            prices: {
              select: { currency: true, amount: true, compareAt: true },
            },
          },
        },
        prices: { select: { currency: true, amount: true, compareAt: true } },
        images: {
          select: {
            id: true,
            mediaAssetId: true,
            sortOrder: true,
            altText: true,
            variantId: true,
            mediaAsset: {
              select: {
                status: true,
                derivatives: { select: { type: true, url: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        productImageRoles: {
          select: {
            id: true,
            role: true,
            sortOrder: true,
            productViewId: true,
            image: {
              select: {
                id: true,
                mediaAssetId: true,
                sortOrder: true,
                altText: true,
                mediaAsset: {
                  select: {
                    status: true,
                    derivatives: { select: { type: true, url: true } },
                  },
                },
              },
            },
          },
        },
        views: {
          select: {
            id: true,
            key: true,
            displayName: true,
            sortOrder: true,
            isDesignable: true,
            isDefault: true,
            printAreas: true,
            templateLayers: {
              select: {
                id: true,
                key: true,
                displayName: true,
                layerType: true,
                blendMode: true,
                opacity: true,
                zIndex: true,
                meta: true,
                image: {
                  select: {
                    id: true,
                    mediaAssetId: true,
                    altText: true,
                    mediaAsset: {
                      select: {
                        status: true,
                        derivatives: { select: { type: true, url: true } },
                      },
                    },
                  },
                },
              },
              orderBy: { zIndex: 'asc' },
            },
            templateEffects: {
              select: {
                id: true,
                optionId: true,
                optionValueId: true,
                templateLayerId: true,
                effectType: true,
                tintHex: true,
                replacementImageId: true,
                meta: true,
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const currency = DEFAULT_CURRENCY;
    const basePrice =
      product.prices.find((price) => price.currency === currency) ?? null;
    const variants = product.variants.map((variant) => {
      const { inventory, ...variantData } = variant;
      const tracked = inventory?.trackInventory === true;
      let availableQuantity: number | null = null;
      let inStock = true;
      if (tracked) {
        availableQuantity = Math.max(
          0,
          inventory.stockOnHand - inventory.reserved,
        );
        inStock = availableQuantity > 0;
      }
      const variantPrice =
        variant.prices.find((price) => price.currency === currency) ?? null;
      const resolved = variantPrice ?? basePrice;
      return {
        ...variantData,
        resolvedPrice: resolved?.amount ?? null,
        resolvedCompareAt: resolved?.compareAt ?? null,
        resolvedCurrency: resolved?.currency ?? currency,
        inStock,
        availableQuantity,
      };
    });
    const images = product.images.map((image) =>
      this.attachImageUrl(image, MediaDerivativeType.DISPLAY),
    );
    const productImageRoles = product.productImageRoles.map((role) => ({
      ...role,
      image: role.image
        ? this.attachImageUrl(
            role.image,
            role.role === ImageRole.THUMBNAIL
              ? MediaDerivativeType.THUMB
              : MediaDerivativeType.DISPLAY,
          )
        : null,
    }));
    const views = product.views.map((view) => ({
      ...view,
      templateLayers: view.templateLayers.map((layer) => ({
        ...layer,
        image: layer.image
          ? this.attachImageUrl(layer.image, MediaDerivativeType.DISPLAY)
          : null,
      })),
    }));
    return {
      ...product,
      resolvedBasePrice: basePrice?.amount ?? null,
      resolvedBaseCompareAt: basePrice?.compareAt ?? null,
      resolvedCurrency: basePrice?.currency ?? currency,
      variants,
      images,
      productImageRoles,
      views,
    };
  }

  /** List all products for admin — no status filter, returns basic catalogue info. */
  async adminFindAll() {
    const products = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        description: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
        prices: { select: { currency: true, amount: true } },
        productImageRoles: {
          where: { role: 'THUMBNAIL' },
          take: 1,
          select: {
            image: {
              select: {
                mediaAsset: {
                  select: {
                    derivatives: { select: { type: true, url: true } },
                  },
                },
              },
            },
          },
        },
        _count: { select: { views: true, variants: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return products.map((p) => {
      const thumb =
        p.productImageRoles[0]?.image?.mediaAsset?.derivatives?.find(
          (d) => d.type === MediaDerivativeType.THUMB,
        )?.url ??
        p.productImageRoles[0]?.image?.mediaAsset?.derivatives?.[0]?.url ??
        null;
      return { ...p, thumbnailUrl: thumb };
    });
  }

  /**
   * Get full product detail for admin — no status filter, includes views,
   * template layers with their ProductImage IDs, print areas, and images.
   */
  async adminFindOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        options: {
          select: {
            id: true,
            code: true,
            name: true,
            sortOrder: true,
            values: {
              select: {
                id: true,
                valueCode: true,
                displayName: true,
                sortOrder: true,
                metadata: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        prices: {
          select: { id: true, currency: true, amount: true, compareAt: true },
        },
        productImageRoles: {
          select: {
            id: true,
            role: true,
            sortOrder: true,
            productViewId: true,
            image: {
              select: {
                id: true,
                altText: true,
                sortOrder: true,
                mediaAsset: {
                  select: {
                    status: true,
                    originalUrl: true,
                    derivatives: { select: { type: true, url: true } },
                  },
                },
              },
            },
          },
        },
        images: {
          select: {
            id: true,
            altText: true,
            sortOrder: true,
            variantId: true,
            mediaAsset: {
              select: {
                status: true,
                originalUrl: true,
                derivatives: { select: { type: true, url: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        views: {
          select: {
            id: true,
            key: true,
            displayName: true,
            sortOrder: true,
            isDesignable: true,
            isDefault: true,
            printAreas: true,
            templateLayers: {
              select: {
                id: true,
                key: true,
                displayName: true,
                layerType: true,
                blendMode: true,
                opacity: true,
                zIndex: true,
                meta: true,
                imageId: true,
                image: {
                  select: {
                    id: true,
                    altText: true,
                    mediaAsset: {
                      select: {
                        originalUrl: true,
                        derivatives: { select: { type: true, url: true } },
                      },
                    },
                  },
                },
              },
              orderBy: { zIndex: 'asc' },
            },
            templateEffects: {
              select: {
                id: true,
                optionId: true,
                optionValueId: true,
                templateLayerId: true,
                effectType: true,
                tintHex: true,
                replacementImageId: true,
                meta: true,
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return {
      ...product,
      views: product.views.map((view) => ({
        ...view,
        templateLayers: view.templateLayers.map((layer) => ({
          ...layer,
          imageUrl:
            layer.image?.mediaAsset?.derivatives?.find(
              (d) => d.type === MediaDerivativeType.DISPLAY,
            )?.url ??
            layer.image?.mediaAsset?.derivatives?.[0]?.url ??
            layer.image?.mediaAsset?.originalUrl ??
            null,
        })),
      })),
    };
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
        weightGrams: dto.weightGrams,
        packageLengthMm: dto.packageLengthMm,
        packageWidthMm: dto.packageWidthMm,
        packageHeightMm: dto.packageHeightMm,
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

    if (dto.categoryId) {
      const cat = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!cat) {
        throw new NotFoundException(
          `Category with id "${dto.categoryId}" not found`,
        );
      }
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
        ...(dto.weightGrams !== undefined && { weightGrams: dto.weightGrams }),
        ...(dto.packageLengthMm !== undefined && {
          packageLengthMm: dto.packageLengthMm,
        }),
        ...(dto.packageWidthMm !== undefined && {
          packageWidthMm: dto.packageWidthMm,
        }),
        ...(dto.packageHeightMm !== undefined && {
          packageHeightMm: dto.packageHeightMm,
        }),
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

    // Guard: block hard-delete if the product has order items or designs that
    // reference it. Prefer setting status to ARCHIVED instead.
    const [orderItemCount, designCount] = await Promise.all([
      this.prisma.orderItem.count({ where: { productId: id } }),
      this.prisma.design.count({ where: { productId: id } }),
    ]);
    if (orderItemCount > 0 || designCount > 0) {
      throw new BadRequestException(
        `Cannot delete product: it is referenced by ${orderItemCount} order item(s) and ${designCount} design(s). ` +
          'Set product status to ARCHIVED instead.',
      );
    }

    return this.prisma.product.delete({
      where: { id },
    });
  }

  /**
   * List variants for a product (admin)
   */
  async listVariants(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.prisma.productVariant.findMany({
      where: { productId },
      include: {
        optionValues: {
          select: {
            option: { select: { code: true, name: true } },
            optionValue: {
              select: { valueCode: true, displayName: true, metadata: true },
            },
          },
        },
        prices: {
          select: { id: true, currency: true, amount: true, compareAt: true },
        },
        inventory: true,
      },
      orderBy: { createdAt: 'asc' },
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
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
        ...(dto.weightGrams !== undefined && { weightGrams: dto.weightGrams }),
        ...(dto.packageLengthMm !== undefined && {
          packageLengthMm: dto.packageLengthMm,
        }),
        ...(dto.packageWidthMm !== undefined && {
          packageWidthMm: dto.packageWidthMm,
        }),
        ...(dto.packageHeightMm !== undefined && {
          packageHeightMm: dto.packageHeightMm,
        }),
      },
    });
  }

  /**
   * Remove a variant (admin)
   */
  async removeVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { orderItems: { select: { id: true } } },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    if (variant.orderItems.length > 0) {
      throw new BadRequestException('Variant has orders and cannot be deleted');
    }
    return this.prisma.productVariant.delete({
      where: { id: variantId },
    });
  }

  /**
   * Create a product option (admin)
   */
  async createOption(productId: string, dto: CreateOptionDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { options: { select: { id: true } } },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.options.length >= MAX_OPTIONS_PER_PRODUCT) {
      throw new BadRequestException(
        `Product cannot have more than ${MAX_OPTIONS_PER_PRODUCT} options`,
      );
    }
    const option = await this.prisma.productOption.create({
      data: {
        productId,
        code: dto.code,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.regenerateVariants(productId);
    return option;
  }

  /**
   * Update a product option (admin)
   */
  async updateOption(
    productId: string,
    optionId: string,
    dto: UpdateOptionDto,
  ) {
    const option = await this.prisma.productOption.findUnique({
      where: { id: optionId },
    });
    if (!option || option.productId !== productId) {
      throw new NotFoundException('Option not found');
    }
    const updated = await this.prisma.productOption.update({
      where: { id: optionId },
      data: {
        ...(dto.code && { code: dto.code }),
        ...(dto.name && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
    await this.regenerateVariants(option.productId);
    return updated;
  }

  /**
   * Delete a product option (admin)
   */
  async deleteOption(productId: string, optionId: string) {
    const option = await this.prisma.productOption.findUnique({
      where: { id: optionId },
    });
    if (!option || option.productId !== productId) {
      throw new NotFoundException('Option not found');
    }
    await this.prisma.productOption.delete({ where: { id: optionId } });
    await this.regenerateVariants(option.productId);
  }

  /**
   * Create an option value (admin)
   */
  async createOptionValue(
    productId: string,
    optionId: string,
    dto: CreateOptionValueDto,
  ) {
    const option = await this.prisma.productOption.findUnique({
      where: { id: optionId },
    });
    if (!option || option.productId !== productId) {
      throw new NotFoundException('Option not found');
    }
    const value = await this.prisma.productOptionValue.create({
      data: {
        optionId,
        valueCode: dto.valueCode,
        displayName: dto.displayName,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.regenerateVariants(option.productId);
    return value;
  }

  /**
   * Update an option value (admin)
   */
  async updateOptionValue(
    productId: string,
    valueId: string,
    dto: UpdateOptionValueDto,
  ) {
    const value = await this.prisma.productOptionValue.findUnique({
      where: { id: valueId },
      include: { option: true },
    });
    if (!value || value.option.productId !== productId) {
      throw new NotFoundException('Option value not found');
    }
    const updated = await this.prisma.productOptionValue.update({
      where: { id: valueId },
      data: {
        ...(dto.valueCode && { valueCode: dto.valueCode }),
        ...(dto.displayName && { displayName: dto.displayName }),
        ...(dto.metadata !== undefined && {
          metadata: dto.metadata as Prisma.InputJsonValue,
        }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
    await this.regenerateVariants(value.option.productId);
    return updated;
  }

  /**
   * Delete an option value (admin)
   */
  async deleteOptionValue(productId: string, valueId: string) {
    const value = await this.prisma.productOptionValue.findUnique({
      where: { id: valueId },
      include: { option: true },
    });
    if (!value || value.option.productId !== productId) {
      throw new NotFoundException('Option value not found');
    }
    await this.prisma.productOptionValue.delete({ where: { id: valueId } });
    await this.regenerateVariants(value.option.productId);
  }

  /**
   * Create a product image from a URL (admin). Enqueues async ingestion.
   */
  async createProductImage(productId: string, dto: CreateProductImageDto) {
    await this.assertProductExists(productId);
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: dto.variantId },
        select: { id: true, productId: true },
      });
      if (!variant || variant.productId !== productId) {
        throw new BadRequestException('Variant does not belong to product');
      }
    }
    const mediaAsset = await this.mediaService.createAssetFromUrl(
      dto.sourceUrl,
    );
    return this.prisma.productImage.create({
      data: {
        productId,
        variantId: dto.variantId,
        mediaAssetId: mediaAsset.id,
        sortOrder: dto.sortOrder ?? 0,
        altText: dto.altText,
      },
    });
  }

  /**
   * Upload a product image (admin). Stores original and enqueues async derivatives.
   */
  async uploadProductImage(
    productId: string,
    file: UploadedImageFile,
    dto: CreateProductImageUploadDto,
  ) {
    await this.assertProductExists(productId);
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: dto.variantId },
        select: { id: true, productId: true },
      });
      if (!variant || variant.productId !== productId) {
        throw new BadRequestException('Variant does not belong to product');
      }
    }

    const mediaAsset = await this.mediaService.createAssetFromUpload(file);
    return this.prisma.productImage.create({
      data: {
        productId,
        variantId: dto.variantId,
        mediaAssetId: mediaAsset.id,
        sortOrder: dto.sortOrder ?? 0,
        altText: dto.altText,
      },
    });
  }

  /**
   * Update a product image (admin)
   */
  async updateProductImage(imageId: string, dto: UpdateProductImageDto) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: dto.variantId },
        select: { id: true, productId: true },
      });
      if (!variant || variant.productId !== image.productId) {
        throw new BadRequestException('Variant does not belong to product');
      }
    }
    if (dto.mediaAssetId) {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: dto.mediaAssetId },
        select: { id: true },
      });
      if (!asset) {
        throw new BadRequestException('Media asset not found');
      }
      // Ensure the asset is already linked to this product via a ProductImage row
      // to prevent cross-product IDOR.
      const linkedToProduct = await this.prisma.productImage.findFirst({
        where: { productId: image.productId, mediaAssetId: dto.mediaAssetId },
        select: { id: true },
      });
      if (!linkedToProduct) {
        throw new BadRequestException(
          'Media asset does not belong to this product',
        );
      }
    }
    return this.prisma.productImage.update({
      where: { id: imageId },
      data: {
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.altText !== undefined && { altText: dto.altText }),
        ...(dto.variantId !== undefined && { variantId: dto.variantId }),
        ...(dto.mediaAssetId !== undefined && {
          mediaAssetId: dto.mediaAssetId,
        }),
      },
    });
  }

  /**
   * Delete a product image (admin).
   * Removes the ProductImage row. The linked MediaAsset and its S3 objects
   * are cleaned up by the media-asset cleanup job when the asset becomes
   * unreferenced (no other ProductImage rows reference it).
   */
  async deleteProductImage(imageId: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      select: { id: true, mediaAssetId: true },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    await this.prisma.productImage.delete({ where: { id: imageId } });
    // Remove the MediaAsset if it is now orphaned (no other ProductImage references it)
    if (image.mediaAssetId) {
      const still = await this.prisma.productImage.count({
        where: { mediaAssetId: image.mediaAssetId },
      });
      if (still === 0) {
        await this.prisma.mediaAsset
          .delete({
            where: { id: image.mediaAssetId },
          })
          .catch(() => {
            /* tolerate concurrent deletes */
          });
      }
    }
  }

  /**
   * Create an image role (admin)
   */
  async createProductImageRole(
    productId: string,
    imageId: string,
    dto: CreateProductImageRoleDto,
  ) {
    await this.assertProductExists(productId);
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.productId !== productId) {
      throw new BadRequestException('Image does not belong to product');
    }
    if (dto.role === ImageRole.WORKSHOP_TEMPLATE && !dto.productViewId) {
      throw new BadRequestException('productViewId is required for templates');
    }
    if (dto.productViewId) {
      await this.assertProductView(productId, dto.productViewId);
    }
    return this.prisma.productImageRole.create({
      data: {
        productId,
        imageId,
        role: dto.role,
        sortOrder: dto.sortOrder,
        productViewId: dto.productViewId,
      },
    });
  }

  /**
   * Update an image role (admin)
   */
  async updateProductImageRole(roleId: string, dto: UpdateProductImageRoleDto) {
    const role = await this.prisma.productImageRole.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new NotFoundException('Image role not found');
    }
    if (dto.role === ImageRole.WORKSHOP_TEMPLATE && !dto.productViewId) {
      throw new BadRequestException('productViewId is required for templates');
    }
    if (dto.productViewId) {
      await this.assertProductView(role.productId, dto.productViewId);
    }
    return this.prisma.productImageRole.update({
      where: { id: roleId },
      data: {
        ...(dto.role && { role: dto.role }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.productViewId !== undefined && {
          productViewId: dto.productViewId,
        }),
      },
    });
  }

  /**
   * Delete an image role (admin)
   */
  async deleteProductImageRole(roleId: string) {
    const role = await this.prisma.productImageRole.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new NotFoundException('Image role not found');
    }
    await this.prisma.productImageRole.delete({ where: { id: roleId } });
  }

  /**
   * Create a product view (admin)
   */
  async createProductView(productId: string, dto: CreateProductViewDto) {
    await this.assertProductExists(productId);
    const created = await this.prisma.productView.create({
      data: {
        productId,
        key: dto.key,
        displayName: dto.displayName,
        sortOrder: dto.sortOrder ?? 0,
        isDesignable: dto.isDesignable ?? true,
        isDefault: dto.isDefault ?? false,
      },
    });
    if (dto.isDefault) {
      await this.prisma.productView.updateMany({
        where: { productId, id: { not: created.id } },
        data: { isDefault: false },
      });
    }
    return created;
  }

  /**
   * Update a product view (admin)
   */
  async updateProductView(viewId: string, dto: UpdateProductViewDto) {
    const view = await this.prisma.productView.findUnique({
      where: { id: viewId },
    });
    if (!view) {
      throw new NotFoundException('Product view not found');
    }
    const updated = await this.prisma.productView.update({
      where: { id: viewId },
      data: {
        ...(dto.key && { key: dto.key }),
        ...(dto.displayName && { displayName: dto.displayName }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isDesignable !== undefined && {
          isDesignable: dto.isDesignable,
        }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
    if (dto.isDefault === true) {
      await this.prisma.productView.updateMany({
        where: { productId: view.productId, id: { not: viewId } },
        data: { isDefault: false },
      });
    }
    return updated;
  }

  /**
   * Delete a product view (admin)
   */
  async deleteProductView(viewId: string) {
    const view = await this.prisma.productView.findUnique({
      where: { id: viewId },
    });
    if (!view) {
      throw new NotFoundException('Product view not found');
    }
    await this.prisma.productView.delete({ where: { id: viewId } });
  }

  /**
   * Upsert print area for a view (admin)
   */
  async upsertPrintArea(
    productId: string,
    productViewId: string,
    dto: CreatePrintAreaDto | UpdatePrintAreaDto,
  ) {
    await this.assertProductView(productId, productViewId);
    return this.prisma.printArea.upsert({
      where: { productId_productViewId: { productId, productViewId } },
      create: {
        productId,
        productViewId,
        x: dto.x ?? 0,
        y: dto.y ?? 0,
        width: dto.width ?? 0,
        height: dto.height ?? 0,
        rotationAllowed: dto.rotationAllowed ?? false,
        maxLayers: dto.maxLayers,
        maxColors: dto.maxColors,
      },
      update: {
        ...(dto.x !== undefined && { x: dto.x }),
        ...(dto.y !== undefined && { y: dto.y }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.rotationAllowed !== undefined && {
          rotationAllowed: dto.rotationAllowed,
        }),
        ...(dto.maxLayers !== undefined && { maxLayers: dto.maxLayers }),
        ...(dto.maxColors !== undefined && { maxColors: dto.maxColors }),
      },
    });
  }

  /**
   * Create a template layer (admin)
   */
  async createTemplateLayer(
    productId: string,
    productViewId: string,
    dto: CreateTemplateLayerDto,
  ) {
    await this.assertProductView(productId, productViewId);
    await this.assertProductImage(productId, dto.imageId);
    return this.prisma.workshopTemplateLayer.create({
      data: {
        productId,
        productViewId,
        key: dto.key,
        displayName: dto.displayName,
        layerType: dto.layerType,
        imageId: dto.imageId,
        blendMode: dto.blendMode ?? BlendMode.NORMAL,
        opacity: dto.opacity ?? 1.0,
        zIndex: dto.zIndex ?? 0,
        meta: dto.meta as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Update a template layer (admin)
   */
  async updateTemplateLayer(layerId: string, dto: UpdateTemplateLayerDto) {
    const layer = await this.prisma.workshopTemplateLayer.findUnique({
      where: { id: layerId },
    });
    if (!layer) {
      throw new NotFoundException('Template layer not found');
    }
    if (dto.imageId) {
      await this.assertProductImage(layer.productId, dto.imageId);
    }
    return this.prisma.workshopTemplateLayer.update({
      where: { id: layerId },
      data: {
        ...(dto.key && { key: dto.key }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.layerType && { layerType: dto.layerType }),
        ...(dto.imageId && { image: { connect: { id: dto.imageId } } }),
        ...(dto.blendMode && { blendMode: dto.blendMode }),
        ...(dto.opacity !== undefined && { opacity: dto.opacity }),
        ...(dto.zIndex !== undefined && { zIndex: dto.zIndex }),
        ...(dto.meta !== undefined && {
          meta: dto.meta as Prisma.InputJsonValue,
        }),
      },
    });
  }

  /**
   * Delete a template layer (admin)
   */
  async deleteTemplateLayer(layerId: string) {
    const layer = await this.prisma.workshopTemplateLayer.findUnique({
      where: { id: layerId },
    });
    if (!layer) {
      throw new NotFoundException('Template layer not found');
    }
    await this.prisma.workshopTemplateLayer.delete({ where: { id: layerId } });
  }

  /**
   * Create a template effect (admin)
   */
  async createTemplateEffect(
    productId: string,
    productViewId: string,
    dto: CreateTemplateEffectDto,
  ) {
    await this.assertProductView(productId, productViewId);
    await this.assertOption(productId, dto.optionId);
    await this.assertOptionValue(dto.optionValueId, dto.optionId);
    await this.assertTemplateLayer(productViewId, dto.templateLayerId);
    if (
      dto.effectType === TemplateEffectType.REPLACE_IMAGE &&
      !dto.replacementImageId
    ) {
      throw new BadRequestException('replacementImageId is required');
    }
    if (dto.replacementImageId) {
      await this.assertProductImage(productId, dto.replacementImageId);
    }
    return this.prisma.optionValueTemplateEffect.create({
      data: {
        productId,
        productViewId,
        optionId: dto.optionId,
        optionValueId: dto.optionValueId,
        templateLayerId: dto.templateLayerId,
        effectType: dto.effectType,
        tintHex: dto.tintHex,
        replacementImageId: dto.replacementImageId,
        meta: dto.meta as Prisma.InputJsonValue | undefined,
      } as Prisma.OptionValueTemplateEffectUncheckedCreateInput,
    });
  }

  /**
   * Update a template effect (admin)
   */
  async updateTemplateEffect(effectId: string, dto: UpdateTemplateEffectDto) {
    const effect = await this.prisma.optionValueTemplateEffect.findUnique({
      where: { id: effectId },
    });
    if (!effect) {
      throw new NotFoundException('Template effect not found');
    }
    if (dto.optionId) {
      await this.assertOption(effect.productId, dto.optionId);
    }
    if (dto.optionValueId) {
      const optionId = dto.optionId ?? effect.optionId;
      await this.assertOptionValue(dto.optionValueId, optionId);
    }
    if (dto.templateLayerId) {
      await this.assertTemplateLayer(effect.productViewId, dto.templateLayerId);
    }
    if (dto.replacementImageId) {
      await this.assertProductImage(effect.productId, dto.replacementImageId);
    }
    return this.prisma.optionValueTemplateEffect.update({
      where: { id: effectId },
      data: {
        ...(dto.optionId && { optionId: dto.optionId }),
        ...(dto.optionValueId && { optionValueId: dto.optionValueId }),
        ...(dto.templateLayerId && { templateLayerId: dto.templateLayerId }),
        ...(dto.effectType && { effectType: dto.effectType }),
        ...(dto.tintHex !== undefined && { tintHex: dto.tintHex }),
        ...(dto.replacementImageId !== undefined && {
          replacementImageId: dto.replacementImageId,
        }),
        ...(dto.meta !== undefined && {
          meta: dto.meta as Prisma.InputJsonValue,
        }),
      } as Prisma.OptionValueTemplateEffectUncheckedUpdateInput,
    });
  }

  /**
   * Delete a template effect (admin)
   */
  async deleteTemplateEffect(effectId: string) {
    const effect = await this.prisma.optionValueTemplateEffect.findUnique({
      where: { id: effectId },
    });
    if (!effect) {
      throw new NotFoundException('Template effect not found');
    }
    await this.prisma.optionValueTemplateEffect.delete({
      where: { id: effectId },
    });
  }

  /**
   * Create or update product price (admin)
   */
  async upsertProductPrice(productId: string, dto: CreateProductPriceDto) {
    await this.assertProductExists(productId);
    return this.prisma.productPrice.upsert({
      where: { productId_currency: { productId, currency: dto.currency } },
      create: {
        productId,
        currency: dto.currency,
        amount: dto.amount,
        compareAt: dto.compareAt,
      },
      update: {
        amount: dto.amount,
        compareAt: dto.compareAt,
      },
    });
  }

  /**
   * Update product price (admin)
   */
  async updateProductPrice(priceId: string, dto: UpdateProductPriceDto) {
    const price = await this.prisma.productPrice.findUnique({
      where: { id: priceId },
    });
    if (!price) {
      throw new NotFoundException('Product price not found');
    }
    return this.prisma.productPrice.update({
      where: { id: priceId },
      data: {
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.compareAt !== undefined && { compareAt: dto.compareAt }),
      },
    });
  }

  /**
   * Delete product price (admin)
   */
  async deleteProductPrice(priceId: string) {
    const price = await this.prisma.productPrice.findUnique({
      where: { id: priceId },
    });
    if (!price) {
      throw new NotFoundException('Product price not found');
    }
    await this.prisma.productPrice.delete({ where: { id: priceId } });
  }

  /**
   * Create or update variant price (admin)
   */
  async upsertVariantPrice(variantId: string, dto: CreateVariantPriceDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    return this.prisma.variantPrice.upsert({
      where: { variantId_currency: { variantId, currency: dto.currency } },
      create: {
        variantId,
        currency: dto.currency,
        amount: dto.amount,
        compareAt: dto.compareAt,
      },
      update: {
        amount: dto.amount,
        compareAt: dto.compareAt,
      },
    });
  }

  /**
   * Update variant price (admin)
   */
  async updateVariantPrice(priceId: string, dto: UpdateVariantPriceDto) {
    const price = await this.prisma.variantPrice.findUnique({
      where: { id: priceId },
    });
    if (!price) {
      throw new NotFoundException('Variant price not found');
    }
    return this.prisma.variantPrice.update({
      where: { id: priceId },
      data: {
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.compareAt !== undefined && { compareAt: dto.compareAt }),
      },
    });
  }

  /**
   * Delete variant price (admin)
   */
  async deleteVariantPrice(priceId: string) {
    const price = await this.prisma.variantPrice.findUnique({
      where: { id: priceId },
    });
    if (!price) {
      throw new NotFoundException('Variant price not found');
    }
    await this.prisma.variantPrice.delete({ where: { id: priceId } });
  }

  // ─── Variant regeneration types ─────────────────────────────────────

  private buildVariantName(combo: { displayName: string }[]): string {
    return combo.map((v) => v.displayName).join(' / ');
  }

  private buildVariantSku(
    slug: string,
    combo: { valueCode: string }[],
    existingSkus: Set<string>,
  ): string {
    const base = `${slug}-${combo.map((v) => v.valueCode.toLowerCase()).join('-')}`;
    return this.generateUniqueSku(base, existingSkus);
  }

  /**
   * Index existing variants by their option-value key.
   * Variants that don't cover all current options (orphans) or
   * collide on the same key (duplicates from option deletion) are
   * collected separately for cleanup.
   */
  private indexExistingVariants(
    variants: {
      id: string;
      name: string;
      isAvailable: boolean;
      optionValues: { optionId: string; optionValueId: string }[];
    }[],
    optionIds: string[],
  ) {
    const existingByKey = new Map<string, (typeof variants)[number]>();
    const staleVariantIds: string[] = [];

    for (const variant of variants) {
      const map = new Map(
        variant.optionValues.map((entry) => [
          entry.optionId,
          entry.optionValueId,
        ]),
      );
      const hasAll = optionIds.every((id) => map.has(id));
      if (!hasAll) {
        // Orphan: missing entries for current options (e.g. after deleteOptionValue)
        staleVariantIds.push(variant.id);
        continue;
      }
      const key = this.buildVariantKey(optionIds, map);
      if (existingByKey.has(key)) {
        // Duplicate: multiple variants map to same key (e.g. after deleteOption)
        staleVariantIds.push(variant.id);
        continue;
      }
      existingByKey.set(key, variant);
    }

    return { existingByKey, staleVariantIds };
  }

  /**
   * Clean up stale variants: delete if no orders, mark unavailable if orders exist.
   * Uses a single batched query to determine which variants have order items.
   */
  private async cleanupStaleVariants(
    tx: Prisma.TransactionClient,
    variantIds: string[],
    availableVariantIds: Set<string>,
  ) {
    if (variantIds.length === 0) return;

    const orderItems = await tx.orderItem.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true },
      distinct: ['variantId'],
    });
    const hasOrdersSet = new Set(orderItems.map((oi) => oi.variantId));

    const toDelete = variantIds.filter((id) => !hasOrdersSet.has(id));
    const toDisable = variantIds.filter(
      (id) => hasOrdersSet.has(id) && availableVariantIds.has(id),
    );

    if (toDelete.length > 0) {
      await tx.productVariant.deleteMany({
        where: { id: { in: toDelete } },
      });
    }
    if (toDisable.length > 0) {
      await tx.productVariant.updateMany({
        where: { id: { in: toDisable } },
        data: { isAvailable: false },
      });
    }
  }

  /**
   * Regenerate variants to match the current option × value matrix.
   *
   * Reads are performed outside the transaction to minimise lock duration.
   * Writes (create, update, delete) run in a short transaction.
   *
   * Handles:
   * - Orphaned variants (missing option entries after value deletion)
   * - Key collisions (duplicate keys after option deletion)
   * - Deterministic sort via tiebreakers on sortOrder + code/valueCode + id
   */
  private async regenerateVariants(productId: string) {
    // ── Phase 1: read current state (outside transaction) ──────────
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        options: {
          include: {
            values: {
              orderBy: [
                { sortOrder: 'asc' },
                { valueCode: 'asc' },
                { id: 'asc' },
              ],
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }, { id: 'asc' }],
        },
        variants: {
          include: {
            optionValues: {
              select: { optionId: true, optionValueId: true },
            },
          },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const options = product.options;
    const optionIds = options.map((o) => o.id);

    // Build lookup tables from already-loaded options (avoids redundant joins)
    const optionValueLookup = new Map<
      string,
      { valueCode: string; displayName: string }
    >();
    for (const option of options) {
      for (const value of option.values) {
        optionValueLookup.set(value.id, {
          valueCode: value.valueCode,
          displayName: value.displayName,
        });
      }
    }

    // Track which variants are currently available (for cleanup decisions)
    const availableVariantIds = new Set(
      product.variants.filter((v) => v.isAvailable).map((v) => v.id),
    );

    // ── Phase 2: handle zero-options (all variants are stale) ──────
    if (options.length === 0) {
      const allVariantIds = product.variants.map((v) => v.id);
      await this.prisma.$transaction(async (tx) => {
        await this.cleanupStaleVariants(tx, allVariantIds, availableVariantIds);
      });
      return;
    }

    // ── Phase 3: guard against combinatorial explosion ─────────────
    const optionValueGroups = options.map((o) => o.values);
    const totalCombos = optionValueGroups.reduce(
      (acc, values) => acc * values.length,
      1,
    );
    if (totalCombos > MAX_VARIANTS_PER_PRODUCT) {
      throw new BadRequestException(
        `Variant combination count would exceed ${MAX_VARIANTS_PER_PRODUCT}. Reduce option values.`,
      );
    }

    // ── Phase 4: compute target combos and index existing variants ─
    const combos = this.cartesianProduct(optionValueGroups);
    const { existingByKey, staleVariantIds } = this.indexExistingVariants(
      product.variants,
      optionIds,
    );

    const existingSkus = new Set(product.variants.map((v) => v.sku));
    const targetKeys = new Set<string>();

    // Collect batched operations
    const namesToUpdate: { id: string; name: string }[] = [];
    const variantsToCreate: {
      name: string;
      sku: string;
      pairs: { optionId: string; optionValueId: string }[];
    }[] = [];

    for (const combo of combos) {
      const map = new Map(combo.map((v) => [v.optionId, v.id]));
      const key = this.buildVariantKey(optionIds, map);
      targetKeys.add(key);

      // Build display info from lookup (de-duplicated)
      const comboInfo = combo.map((v) => {
        const info = optionValueLookup.get(v.id);
        return {
          optionId: v.optionId,
          optionValueId: v.id,
          valueCode: info?.valueCode ?? v.valueCode,
          displayName: info?.displayName ?? v.displayName,
        };
      });
      const name = this.buildVariantName(comboInfo);

      const existing = existingByKey.get(key);
      if (existing) {
        if (existing.name !== name) {
          namesToUpdate.push({ id: existing.id, name });
        }
        continue;
      }

      const sku = this.buildVariantSku(product.slug, comboInfo, existingSkus);
      variantsToCreate.push({
        name,
        sku,
        pairs: comboInfo.map((c) => ({
          optionId: c.optionId,
          optionValueId: c.optionValueId,
        })),
      });
    }

    // Stale variants from existingByKey that are no longer in targetKeys
    for (const [key, variant] of existingByKey.entries()) {
      if (!targetKeys.has(key)) {
        staleVariantIds.push(variant.id);
      }
    }

    // ── Phase 5: write in a short transaction ──────────────────────
    await this.prisma.$transaction(async (tx) => {
      // Batch name updates
      for (const { id, name } of namesToUpdate) {
        await tx.productVariant.update({
          where: { id },
          data: { name },
        });
      }

      // Batch creates (createMany doesn't support nested creates,
      // so we create variants then bulk-insert join table entries)
      if (variantsToCreate.length > 0) {
        const createdVariants: {
          id: string;
          pairs: { optionId: string; optionValueId: string }[];
        }[] = [];
        for (const spec of variantsToCreate) {
          const created = await tx.productVariant.create({
            data: {
              productId: product.id,
              name: spec.name,
              sku: spec.sku,
              isAvailable: true,
            },
            select: { id: true },
          });
          createdVariants.push({ id: created.id, pairs: spec.pairs });
        }

        // Batch-insert all VariantOptionValue rows
        const joinRows = createdVariants.flatMap((v) =>
          v.pairs.map((p) => ({
            variantId: v.id,
            optionId: p.optionId,
            optionValueId: p.optionValueId,
          })),
        );
        if (joinRows.length > 0) {
          await tx.variantOptionValue.createMany({ data: joinRows });
        }
      }

      // Clean up stale variants (orphans, duplicates, removed combos)
      await this.cleanupStaleVariants(tx, staleVariantIds, availableVariantIds);
    });
  }

  private async assertProductExists(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  private async assertProductView(productId: string, viewId: string) {
    const view = await this.prisma.productView.findUnique({
      where: { id: viewId },
      select: { id: true, productId: true },
    });
    if (!view || view.productId !== productId) {
      throw new BadRequestException('Product view does not belong to product');
    }
  }

  private async assertProductImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      select: { id: true, productId: true },
    });
    if (!image || image.productId !== productId) {
      throw new BadRequestException('Image does not belong to product');
    }
  }

  private async assertOption(productId: string, optionId: string) {
    const option = await this.prisma.productOption.findUnique({
      where: { id: optionId },
      select: { id: true, productId: true },
    });
    if (!option || option.productId !== productId) {
      throw new BadRequestException('Option does not belong to product');
    }
  }

  private async assertOptionValue(optionValueId: string, optionId: string) {
    const value = await this.prisma.productOptionValue.findUnique({
      where: { id: optionValueId },
      select: { id: true, optionId: true },
    });
    if (!value || value.optionId !== optionId) {
      throw new BadRequestException('Option value does not belong to option');
    }
  }

  private async assertTemplateLayer(productViewId: string, layerId: string) {
    const layer = await this.prisma.workshopTemplateLayer.findUnique({
      where: { id: layerId },
      select: { id: true, productViewId: true },
    });
    if (!layer || layer.productViewId !== productViewId) {
      throw new BadRequestException('Template layer does not belong to view');
    }
  }

  /**
   * Return everything the Design Workshop editor needs to initialise for a product,
   * in a single request: product metadata, options, views with print areas,
   * template layers (with resolved image URLs), and option-value effects.
   */
  async getWorkshopContext(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            sortOrder: true,
            values: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                displayName: true,
                valueCode: true,
                metadata: true,
                sortOrder: true,
              },
            },
          },
        },
        views: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            key: true,
            displayName: true,
            sortOrder: true,
            isDesignable: true,
            isDefault: true,
            printAreas: {
              select: {
                id: true,
                x: true,
                y: true,
                width: true,
                height: true,
                rotationAllowed: true,
                maxLayers: true,
                maxColors: true,
              },
            },
            templateLayers: {
              orderBy: { zIndex: 'asc' },
              select: {
                id: true,
                key: true,
                displayName: true,
                layerType: true,
                blendMode: true,
                opacity: true,
                zIndex: true,
                meta: true,
                image: {
                  select: {
                    mediaAsset: {
                      select: {
                        derivatives: {
                          select: { type: true, url: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            templateEffects: {
              select: {
                id: true,
                optionValueId: true,
                templateLayerId: true,
                effectType: true,
                tintHex: true,
                meta: true,
                replacementImage: {
                  select: {
                    mediaAsset: {
                      select: {
                        derivatives: {
                          select: { type: true, url: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const views = product.views.map((view) => ({
      id: view.id,
      key: view.key,
      displayName: view.displayName,
      sortOrder: view.sortOrder,
      isDesignable: view.isDesignable,
      isDefault: view.isDefault,
      printArea: view.printAreas[0] ?? null,
      templateLayers: view.templateLayers.map((layer) => ({
        id: layer.id,
        key: layer.key,
        displayName: layer.displayName,
        layerType: layer.layerType,
        blendMode: layer.blendMode,
        opacity: layer.opacity,
        zIndex: layer.zIndex,
        meta: layer.meta,
        imageUrl: this.resolveImageUrl(
          layer.image?.mediaAsset?.derivatives,
          MediaDerivativeType.DISPLAY,
        ),
      })),
      effects: view.templateEffects.map((effect) => ({
        id: effect.id,
        optionValueId: effect.optionValueId,
        templateLayerId: effect.templateLayerId,
        effectType: effect.effectType,
        tintHex: effect.tintHex,
        meta: effect.meta,
        replacementImageUrl: this.resolveImageUrl(
          effect.replacementImage?.mediaAsset?.derivatives,
          MediaDerivativeType.DISPLAY,
        ),
      })),
    }));

    return {
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        options: product.options,
      },
      views,
    };
  }
}
