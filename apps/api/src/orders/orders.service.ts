import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderStatus,
  PaymentStatus,
  CurrencyCode,
} from '../generated/prisma/enums';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create an order in PENDING_PAYMENT. Validates address, items, and computes totals.
   */
  async create(userId: string, dto: CreateOrderDto) {
    const address = await this.prisma.address.findUnique({
      where: { id: dto.shippingAddressId },
    });
    if (!address) {
      throw new NotFoundException('Shipping address not found');
    }
    if (address.userId !== userId) {
      throw new ForbiddenException('Address does not belong to you');
    }
    if (!dto.items?.length) {
      throw new BadRequestException('At least one item is required');
    }

    let subtotal = 0;
    const orderItemsData: Array<{
      productId: string;
      variantId: string;
      designId: string | null;
      campaignId: string | null;
      quantity: number;
      unitBasePrice: number;
      unitViewSurcharge: number;
      unitDiscountAmount: number;
      unitFinalPrice: number;
    }> = [];

    for (const item of dto.items) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: item.variantId },
        include: {
          product: true,
          prices: { where: { currency: CurrencyCode.NGN }, take: 1 },
        },
      });
      if (!variant) {
        throw new BadRequestException(`Variant ${item.variantId} not found`);
      }
      if (variant.productId !== item.productId) {
        throw new BadRequestException(
          `Variant ${item.variantId} does not belong to product ${item.productId}`,
        );
      }
      if (!variant.isAvailable) {
        throw new BadRequestException(
          `Variant ${item.variantId} is not available`,
        );
      }

      let unitPrice = 0;
      const variantPrice = variant.prices[0];
      if (variantPrice) {
        unitPrice = Number(variantPrice.amount);
      } else if (variant.priceOverride != null) {
        unitPrice = Number(variant.priceOverride);
      } else {
        const productPrice = await this.prisma.productPrice.findFirst({
          where: {
            productId: variant.productId,
            currency: CurrencyCode.NGN,
          },
        });
        if (productPrice) {
          unitPrice = Number(productPrice.amount);
        }
      }
      if (unitPrice <= 0) {
        throw new BadRequestException(
          `No price found for product ${item.productId} / variant ${item.variantId}`,
        );
      }

      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      orderItemsData.push({
        productId: item.productId,
        variantId: item.variantId,
        designId: item.designId ?? null,
        campaignId: item.campaignId ?? null,
        quantity: item.quantity,
        unitBasePrice: unitPrice,
        unitViewSurcharge: 0,
        unitDiscountAmount: 0,
        unitFinalPrice: unitPrice,
      });
    }

    const shippingFee = 0;
    const discountAmount = 0;
    const totalAmount = subtotal + shippingFee - discountAmount;

    const order = await this.prisma.order.create({
      data: {
        userId,
        shippingAddressId: dto.shippingAddressId,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        currency: CurrencyCode.NGN,
        subtotalAmount: subtotal,
        shippingFee,
        discountAmount,
        totalAmount,
        shipRecipientName: address.recipientName,
        shipPhone: address.phone,
        shipLine1: address.addressLine1,
        shipLine2: address.addressLine2,
        shipCity: address.city,
        shipState: address.state,
        shipPostalCode: address.postalCode,
        shipCountry: address.country ?? 'Nigeria',
        shipLandmark: address.landmark,
        shipInstructions: address.instructions,
        items: {
          create: orderItemsData.map((row) => ({
            productId: row.productId,
            variantId: row.variantId,
            designId: row.designId,
            campaignId: row.campaignId,
            quantity: row.quantity,
            unitBasePrice: row.unitBasePrice,
            unitViewSurcharge: row.unitViewSurcharge,
            unitDiscountAmount: row.unitDiscountAmount,
            unitFinalPrice: row.unitFinalPrice,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
        shippingAddress: {
          select: { id: true, city: true, state: true, country: true },
        },
      },
    });

    return order;
  }

  /**
   * List orders for current user
   */
  async findAll(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
  }

  /**
   * Get a single order by ID (own only)
   */
  async findOne(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
            variant: { select: { id: true, name: true, sku: true } },
            design: { select: { id: true, name: true } },
          },
        },
        shippingAddress: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return order;
  }

  /**
   * List all orders (admin). Optional status filter.
   */
  async findAllForAdmin(status?: string) {
    const where = status ? { status: status as OrderStatus } : {};
    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
  }

  /**
   * Get any order by ID (admin)
   */
  async findOneForAdmin(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
            variant: { select: { id: true, name: true, sku: true } },
            design: { select: { id: true, name: true } },
          },
        },
        shippingAddress: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /**
   * Update order status (admin)
   */
  async updateOrderStatus(id: string, status: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.prisma.order.update({
      where: { id },
      data: { status: status as OrderStatus },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
