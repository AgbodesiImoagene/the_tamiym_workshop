import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderStatus,
  PaymentStatus,
  AuditAction,
  NotificationChannel,
  OrderItemSnapshotSource,
  RefundStatus,
} from '../generated/prisma/enums';
import { ORDER_PENDING_EXPIRY_MINUTES } from '../constants';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import {
  OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER,
  OUTBOX_EVENT_ORDER_DELIVERED,
  OUTBOX_EVENT_ORDER_FULFILLED,
  OUTBOX_EVENT_ORDER_PROCESSING,
} from '../mail/mail-outbox-templates';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import {
  ADMIN_NOTIF_ORDER_PLACED,
  ADMIN_NOTIF_ORDER_STATUS_CHANGED,
} from '../admin-notifications/admin-notification-events';
import { InventoryLowStockNotifier } from '../admin-notifications/inventory-low-stock.notifier';
import { InventoryLifecycleService } from '../inventory/inventory-lifecycle.service';
import { AccountPolicyService } from '../auth/account-policy.service';
import {
  CUSTOMER_ORDER_DETAIL_POLICY_VERSION,
  CUSTOMER_ORDER_SHIPMENT_PLACEHOLDER,
  ORDER_ITEM_DISPLAY_SNAPSHOT_VERSION,
} from './order-item-snapshot';
import { isPaymentRetryEligible as computePaymentRetryEligible } from './payment-eligibility';
import type { CustomerOrderDetailDto } from './dto/customer-order-detail.dto';
import type { PricingLineItemOutput } from '../pricing/pricing.types';
import type { OrderItemDisplaySnapshots } from './order-item-snapshot';

type QuoteLineForCreate = PricingLineItemOutput & OrderItemDisplaySnapshots;

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private pricingService: PricingService,
    private config: ConfigService,
    private notificationOutboxDelivery: NotificationOutboxDeliveryService,
    private adminNotify: AdminNotifyService,
    private inventoryLowStockNotifier: InventoryLowStockNotifier,
    private inventoryLifecycle: InventoryLifecycleService,
    private accountPolicy: AccountPolicyService,
  ) {}

  /**
   * Create a standard order (no campaign) in PENDING_PAYMENT. Uses PricingService for totals and breakdowns; reserves inventory; supports idempotency.
   */
  async create(userId: string, dto: CreateOrderDto) {
    await this.assertEmailVerifiedForOrder(userId);

    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: this.orderInclude(),
      });
      if (existing) {
        return existing;
      }
    }

    await this.assertDesignOwnershipAndProductMatch(userId, dto.items);

    const quoteDto = {
      shippingAddressId: dto.shippingAddressId,
      items: dto.items.map((i) => ({
        variantId: i.variantId,
        designId: i.designId,
        quantity: i.quantity,
      })),
    };
    const quote = await this.pricingService.quoteStandard(userId, quoteDto);
    this.assertShippingResolved(
      quote.shippingBreakdown as Prisma.JsonValue | null,
    );

    await this.assertInventoryAvailable(
      quote.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      })),
    );

    const address = await this.prisma.address.findUnique({
      where: { id: dto.shippingAddressId },
    });
    if (!address || address.userId !== userId) {
      throw new ForbiddenException('Access denied to shipping address');
    }

    const expiresAt = new Date(
      Date.now() + ORDER_PENDING_EXPIRY_MINUTES * 60 * 1000,
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          shippingAddressId: dto.shippingAddressId,
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
          currency: quote.currency as 'NGN',
          subtotalAmount: quote.subtotalAmount,
          shippingFee: quote.shippingFee,
          discountAmount: quote.discountAmount,
          vatAmount: quote.vatAmount,
          roundingAdjustment: quote.roundingAdjustment,
          vatRateSnapshot: quote.vatRate,
          pricesIncludeVatSnapshot: quote.pricesIncludeVat,
          vatAppliesToShippingSnapshot: quote.vatAppliesToShipping,
          pricingPolicyVersion: quote.pricingPolicyVersion,
          totalAmount: quote.totalAmount,
          shipRecipientName: address.recipientName,
          shipPhone: address.phone,
          shipLine1: address.addressLine1,
          shipLine2: address.addressLine2,
          shipCity: address.city,
          shipState: address.state ?? '',
          shipPostalCode: address.postalCode,
          shipCountry: address.country ?? 'Nigeria',
          shipLandmark: address.landmark,
          shipInstructions: address.instructions,
          shippingBreakdown: quote.shippingBreakdown as object,
          expiresAt,
          idempotencyKey: dto.idempotencyKey ?? null,
          items: {
            create: quote.items.map((item) =>
              this.toOrderItemCreateData(item as QuoteLineForCreate),
            ),
          },
        },
        include: this.orderInclude(),
      });
      await this.inventoryLifecycle.reserveOrderItems(
        created.id,
        created.items.map((i) => ({
          id: i.id,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        tx,
      );
      return created;
    });

    const orderNotificationRecipient = this.config.get<string>(
      'ORDER_PLACE_NOTIFICATION_EMAIL',
    );
    if (orderNotificationRecipient) {
      const notification = await this.prisma.notificationOutbox.create({
        data: {
          eventName: 'OrderPlaced',
          channel: NotificationChannel.EMAIL,
          recipient: orderNotificationRecipient,
          recipientUserId: userId,
          payload: {
            orderId: order.id,
            totalAmount: Number(order.totalAmount),
            currency: order.currency,
          },
        },
      });
      await this.notificationOutboxDelivery.enqueueDelivery(notification.id);
    }

    await this.adminNotify.emit(ADMIN_NOTIF_ORDER_PLACED, {
      orderId: order.id,
      userId,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      campaignId: '',
    });

    await this.notifyLowStockForOrderItems(order.items);

    return order;
  }

  /**
   * Create a campaign order. All items are for the given campaign. Uses PricingService; reserves inventory; supports idempotency.
   */
  async createCampaignOrder(
    campaignId: string,
    userId: string,
    dto: CreateOrderDto,
  ) {
    await this.assertEmailVerifiedForOrder(userId);

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: this.orderInclude(),
      });
      if (existing && existing.campaignId === campaignId) {
        return existing;
      }
    }

    const quoteDto = {
      shippingAddressId: dto.shippingAddressId,
      items: dto.items.map((i) => ({
        variantId: i.variantId,
        designId: i.designId,
        quantity: i.quantity,
      })),
    };
    const quote = await this.pricingService.quoteCampaign(
      userId,
      campaignId,
      quoteDto,
    );
    this.assertShippingResolved(
      quote.shippingBreakdown as Prisma.JsonValue | null,
    );

    await this.assertInventoryAvailable(
      quote.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      })),
    );

    const address = await this.prisma.address.findUnique({
      where: { id: dto.shippingAddressId },
    });
    if (!address || address.userId !== userId) {
      throw new ForbiddenException('Access denied to shipping address');
    }

    const expiresAt = new Date(
      Date.now() + ORDER_PENDING_EXPIRY_MINUTES * 60 * 1000,
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          shippingAddressId: dto.shippingAddressId,
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
          campaignId,
          currency: quote.currency as 'NGN',
          subtotalAmount: quote.subtotalAmount,
          shippingFee: quote.shippingFee,
          discountAmount: quote.discountAmount,
          vatAmount: quote.vatAmount,
          roundingAdjustment: quote.roundingAdjustment,
          vatRateSnapshot: quote.vatRate,
          pricesIncludeVatSnapshot: quote.pricesIncludeVat,
          vatAppliesToShippingSnapshot: quote.vatAppliesToShipping,
          pricingPolicyVersion: quote.pricingPolicyVersion,
          totalAmount: quote.totalAmount,
          shipRecipientName: address.recipientName,
          shipPhone: address.phone,
          shipLine1: address.addressLine1,
          shipLine2: address.addressLine2,
          shipCity: address.city,
          shipState: address.state ?? '',
          shipPostalCode: address.postalCode,
          shipCountry: address.country ?? 'Nigeria',
          shipLandmark: address.landmark,
          shipInstructions: address.instructions,
          shippingBreakdown: quote.shippingBreakdown as object,
          expiresAt,
          idempotencyKey: dto.idempotencyKey ?? null,
          items: {
            create: quote.items.map((item) =>
              this.toOrderItemCreateData(
                item as QuoteLineForCreate,
                campaignId,
              ),
            ),
          },
        },
        include: this.orderInclude(),
      });
      await this.inventoryLifecycle.reserveOrderItems(
        created.id,
        created.items.map((i) => ({
          id: i.id,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        tx,
      );
      if (
        quote.discountAmount > 0 &&
        quote.appliedDiscountId != null &&
        quote.appliedDiscountId !== ''
      ) {
        await tx.orderDiscount.create({
          data: {
            orderId: created.id,
            discountId: quote.appliedDiscountId,
            currency: quote.currency as 'NGN',
            amountApplied: quote.discountAmount,
          },
        });
      }
      return created;
    });

    await this.adminNotify.emit(ADMIN_NOTIF_ORDER_PLACED, {
      orderId: order.id,
      userId,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      campaignId,
    });

    await this.notifyLowStockForOrderItems(order.items);

    return order;
  }

  private async notifyLowStockForOrderItems(
    items: Array<{ variantId: string; quantity: number }>,
  ): Promise<void> {
    const byVariant = new Map<string, number>();
    for (const line of items) {
      byVariant.set(
        line.variantId,
        (byVariant.get(line.variantId) ?? 0) + line.quantity,
      );
    }
    await Promise.all(
      [...byVariant.entries()].map(async ([variantId, qty]) => {
        const inv = await this.prisma.inventoryItem.findUnique({
          where: { variantId },
        });
        if (!inv?.trackInventory) return;
        const afterAvailable = inv.stockOnHand - inv.reserved;
        const previousAvailable = afterAvailable + qty;
        await this.inventoryLowStockNotifier.afterInventoryChange(
          variantId,
          previousAvailable,
        );
      }),
    );
  }

  private async assertEmailVerifiedForOrder(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!user) {
      throw new ForbiddenException('Access denied');
    }
    this.accountPolicy.assertVerifiedForAction(user, 'CREATE_ORDER');
  }

  private orderInclude() {
    return {
      items: {
        include: {
          product: { select: { id: true, name: true, slug: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
      },
      shippingAddress: {
        select: { id: true, city: true, state: true, country: true },
      },
    } as const;
  }

  /**
   * Persist PURCHASE display snapshots from the pricing quote (TTW-033).
   */
  private toOrderItemCreateData(
    item: QuoteLineForCreate,
    campaignIdOverride?: string,
  ) {
    return {
      productId: item.productId,
      variantId: item.variantId,
      designId: item.designId,
      campaignId: campaignIdOverride ?? item.campaignId,
      quantity: item.quantity,
      unitBasePrice: item.unitBasePrice,
      unitViewSurcharge: item.unitViewSurcharge,
      unitDiscountAmount: item.unitDiscountAmount,
      unitFinalPrice: item.unitFinalPrice,
      variantSnapshot: item.variantSnapshot as object,
      productNameSnapshot: item.productNameSnapshot,
      variantDisplaySnapshot: item.variantDisplaySnapshot,
      optionPresentationSnapshot: item.optionPresentationSnapshot as object,
      snapshotSource: OrderItemSnapshotSource.PURCHASE,
      snapshotVersion: ORDER_ITEM_DISPLAY_SNAPSHOT_VERSION,
      pricingBreakdown: item.pricingBreakdown as object,
      organizerCostBasis: item.organizerCostBasis,
    };
  }

  private decimalToNumber(value: unknown): number {
    if (value == null) return 0;
    return Number(value);
  }

  private toIso(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    return value instanceof Date ? value.toISOString() : String(value);
  }

  /**
   * Payment retry is allowed only for an owned, unexpired PENDING_PAYMENT order
   * with no active (PENDING|INITIATED) payment attempt (TTW-033 interim).
   */
  isPaymentRetryEligible(input: {
    status: OrderStatus;
    expiresAt: Date | string | null;
    payments: Array<{
      status: PaymentStatus;
      expiresAt?: Date | string | null;
    }>;
    now?: Date;
  }): boolean {
    return computePaymentRetryEligible(input);
  }

  /**
   * Validate that each item's design (if present) belongs to the user and matches the variant's product.
   */
  private async assertDesignOwnershipAndProductMatch(
    userId: string,
    items: Array<{ variantId: string; designId?: string | null }>,
  ): Promise<void> {
    for (const item of items) {
      if (!item.designId) continue;
      const [design, variant] = await Promise.all([
        this.prisma.design.findUnique({
          where: { id: item.designId },
          select: { id: true, userId: true, productId: true },
        }),
        this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
          select: { productId: true },
        }),
      ]);
      if (!design) {
        throw new BadRequestException(`Design ${item.designId} not found`);
      }
      if (design.userId !== userId) {
        throw new ForbiddenException(
          'Access denied: design does not belong to you',
        );
      }
      if (!variant) {
        throw new BadRequestException(`Variant ${item.variantId} not found`);
      }
      if (design.productId !== variant.productId) {
        throw new BadRequestException(
          `Design does not belong to the same product as variant ${item.variantId}`,
        );
      }
    }
  }

  private async assertInventoryAvailable(
    lines: Array<{ variantId: string; quantity: number }>,
  ): Promise<void> {
    for (const { variantId, quantity } of lines) {
      const inv = await this.prisma.inventoryItem.findUnique({
        where: { variantId },
      });
      if (!inv?.trackInventory) continue;
      const available = inv.stockOnHand - inv.reserved;
      if (quantity > available) {
        throw new BadRequestException(
          `Insufficient stock for variant ${variantId}`,
        );
      }
    }
  }

  private assertShippingResolved(
    shippingBreakdown: Prisma.JsonValue | null,
  ): asserts shippingBreakdown is Prisma.JsonObject {
    if (!shippingBreakdown) {
      throw new BadRequestException(
        'Shipping destination could not be resolved for this address',
      );
    }
  }

  /**
   * List campaign orders for the campaign organizer. Redacted: no buyer PII; includes status, dates, line items, and organizer economics (e.g. organizerCostBasis).
   */
  async findOrdersByCampaignForOrganizer(
    campaignId: string,
    organizerId: string,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, organizerId: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (campaign.organizerId !== organizerId) {
      throw new ForbiddenException('Access denied to this campaign');
    }

    return this.prisma.order.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        currency: true,
        subtotalAmount: true,
        shippingFee: true,
        discountAmount: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        cancelledAt: true,
        shippingBreakdown: true,
        items: {
          select: {
            id: true,
            productId: true,
            variantId: true,
            designId: true,
            quantity: true,
            unitFinalPrice: true,
            unitBasePrice: true,
            unitViewSurcharge: true,
            unitDiscountAmount: true,
            organizerCostBasis: true,
            variantSnapshot: true,
            pricingBreakdown: true,
            product: { select: { id: true, name: true, slug: true } },
            variant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
  }

  /**
   * List orders for current user (customer-safe list projection).
   */
  async findAll(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        currency: true,
        totalAmount: true,
        createdAt: true,
        expiresAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
            productNameSnapshot: true,
            variantDisplaySnapshot: true,
            snapshotSource: true,
            unitFinalPrice: true,
          },
        },
      },
    });
    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      totalAmount: this.decimalToNumber(order.totalAmount),
      createdAt: this.toIso(order.createdAt)!,
      expiresAt: this.toIso(order.expiresAt),
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        productNameSnapshot: item.productNameSnapshot,
        variantDisplaySnapshot: item.variantDisplaySnapshot,
        snapshotSource: item.snapshotSource,
        unitFinalPrice: this.decimalToNumber(item.unitFinalPrice),
      })),
    }));
  }

  /**
   * Get a single owned order as an explicit customer-safe detail DTO (TTW-033).
   * Unauthorized and missing ids both return NotFoundException.
   */
  async findOne(userId: string, id: string): Promise<CustomerOrderDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentStatus: true,
        currency: true,
        subtotalAmount: true,
        shippingFee: true,
        discountAmount: true,
        vatAmount: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        cancelledAt: true,
        paymentReference: true,
        shipRecipientName: true,
        shipPhone: true,
        shipLine1: true,
        shipLine2: true,
        shipCity: true,
        shipState: true,
        shipPostalCode: true,
        shipCountry: true,
        shipLandmark: true,
        campaignId: true,
        campaign: {
          select: { id: true, title: true, slug: true },
        },
        items: {
          select: {
            id: true,
            productId: true,
            variantId: true,
            designId: true,
            campaignId: true,
            quantity: true,
            unitFinalPrice: true,
            productNameSnapshot: true,
            variantDisplaySnapshot: true,
            optionPresentationSnapshot: true,
            snapshotSource: true,
            snapshotVersion: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            amount: true,
            currency: true,
            providerRef: true,
            createdAt: true,
            expiresAt: true,
          },
        },
        refunds: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            amount: true,
            currency: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    const refundedAmountConfirmed = order.refunds
      .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
      .reduce((sum, refund) => sum + this.decimalToNumber(refund.amount), 0);

    const paymentRetryEligible = this.isPaymentRetryEligible({
      status: order.status,
      expiresAt: order.expiresAt,
      payments: order.payments,
    });

    return {
      policyVersion: CUSTOMER_ORDER_DETAIL_POLICY_VERSION,
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotalAmount: this.decimalToNumber(order.subtotalAmount),
      shippingFee: this.decimalToNumber(order.shippingFee),
      discountAmount: this.decimalToNumber(order.discountAmount),
      vatAmount:
        order.vatAmount == null ? null : this.decimalToNumber(order.vatAmount),
      totalAmount: this.decimalToNumber(order.totalAmount),
      createdAt: this.toIso(order.createdAt)!,
      updatedAt: this.toIso(order.updatedAt)!,
      expiresAt: this.toIso(order.expiresAt),
      cancelledAt: this.toIso(order.cancelledAt),
      paymentReference: order.paymentReference,
      items: order.items.map((item) => {
        const unitFinalPrice = this.decimalToNumber(item.unitFinalPrice);
        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          designId: item.designId,
          campaignId: item.campaignId,
          quantity: item.quantity,
          unitFinalPrice,
          lineTotal: unitFinalPrice * item.quantity,
          productNameSnapshot: item.productNameSnapshot,
          variantDisplaySnapshot: item.variantDisplaySnapshot,
          optionPresentationSnapshot: Array.isArray(
            item.optionPresentationSnapshot,
          )
            ? (item.optionPresentationSnapshot as unknown as CustomerOrderDetailDto['items'][number]['optionPresentationSnapshot'])
            : null,
          snapshotSource: item.snapshotSource,
          snapshotVersion: item.snapshotVersion,
          legacySnapshotDisclosure:
            item.snapshotSource ===
            OrderItemSnapshotSource.BACKFILLED_CURRENT_CATALOG,
        };
      }),
      shipping: {
        recipientName: order.shipRecipientName,
        phone: order.shipPhone,
        line1: order.shipLine1,
        line2: order.shipLine2,
        city: order.shipCity,
        state: order.shipState,
        postalCode: order.shipPostalCode,
        country: order.shipCountry,
        landmark: order.shipLandmark,
      },
      payments: order.payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amount: this.decimalToNumber(payment.amount),
        currency: payment.currency,
        providerRef: payment.providerRef,
        createdAt: this.toIso(payment.createdAt)!,
        expiresAt: this.toIso(payment.expiresAt),
      })),
      refunds: order.refunds.map((refund) => ({
        id: refund.id,
        status: refund.status,
        amount: this.decimalToNumber(refund.amount),
        currency: refund.currency,
        reason: refund.reason,
        createdAt: this.toIso(refund.createdAt)!,
      })),
      refundedAmountConfirmed,
      campaignId: order.campaignId,
      campaign: order.campaign
        ? {
            id: order.campaign.id,
            title: order.campaign.title,
            slug: order.campaign.slug,
          }
        : null,
      paymentRetryEligible,
      // TTW-040 owns shipment timeline; no Shipment model in slice 1.
      shipmentPlaceholder: CUSTOMER_ORDER_SHIPMENT_PLACEHOLDER,
    };
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
        refunds: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            reason: true,
            providerRef: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /**
   * Allowed admin-driven order status transitions. REFUNDED is set only by refund flow.
   */
  private static readonly ALLOWED_ADMIN_TRANSITIONS: Partial<
    Record<OrderStatus, OrderStatus[]>
  > = {
    [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CANCELLED],
    [OrderStatus.PAID]: [OrderStatus.PROCESSING],
    [OrderStatus.PARTIALLY_REFUNDED]: [OrderStatus.PROCESSING],
    [OrderStatus.PROCESSING]: [OrderStatus.FULFILLED, OrderStatus.CANCELLED],
    [OrderStatus.FULFILLED]: [OrderStatus.DELIVERED],
  };

  /**
   * Update order status (admin). Enforces allowed state transitions; CANCELLED from PENDING_PAYMENT releases inventory (TTW-014).
   * Writes an audit log entry for the status change.
   */
  async updateOrderStatus(id: string, status: string, actorUserId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { select: { id: true, variantId: true, quantity: true } },
        user: { select: { id: true, email: true, firstName: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    const currentStatus = order.status;
    const newStatus = status as OrderStatus;
    const allowed = OrdersService.ALLOWED_ADMIN_TRANSITIONS[currentStatus];
    if (!allowed?.includes(newStatus)) {
      throw new BadRequestException(
        `Transition from ${currentStatus} to ${newStatus} is not allowed`,
      );
    }

    let updated;

    if (
      currentStatus === OrderStatus.PENDING_PAYMENT &&
      newStatus === OrderStatus.CANCELLED
    ) {
      updated = await this.prisma.$transaction(async (tx) => {
        const cancelled = await tx.order.updateMany({
          where: {
            id,
            status: OrderStatus.PENDING_PAYMENT,
          },
          data: {
            status: newStatus,
            cancelledAt: new Date(),
          },
        });
        if (cancelled.count !== 1) {
          throw new ConflictException(
            'Order is no longer pending payment; cancel aborted',
          );
        }
        await this.inventoryLifecycle.releaseOrderItems(
          id,
          order.items.map((i) => ({
            id: i.id,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          tx,
          { reason: 'admin_cancel_unpaid' },
        );
        return tx.order.findUniqueOrThrow({
          where: { id },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true } },
                variant: { select: { id: true, name: true } },
              },
            },
          },
        });
      });
    } else {
      updated = await this.prisma.order.update({
        where: { id },
        data: { status: newStatus },
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

    await this.audit.log({
      eventName: 'admin.order.status.updated',
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Order',
      entityId: id,
      actorUserId: actorUserId ?? null,
      before: { status: currentStatus },
      after: { status: newStatus },
      note: `Admin updated order status from ${currentStatus} to ${newStatus}`,
    });

    await this.queueCustomerOrderStatusEmail(id, order.user, newStatus);

    await this.adminNotify.emit(ADMIN_NOTIF_ORDER_STATUS_CHANGED, {
      orderId: id,
      previousStatus: currentStatus,
      newStatus,
      actorUserId: actorUserId ?? '',
    });

    return updated;
  }

  private async queueCustomerOrderStatusEmail(
    orderId: string,
    user: { id: string; email: string; firstName: string } | null | undefined,
    newStatus: OrderStatus,
  ): Promise<void> {
    if (!user?.email) return;
    let eventName: string | null = null;
    switch (newStatus) {
      case OrderStatus.PROCESSING:
        eventName = OUTBOX_EVENT_ORDER_PROCESSING;
        break;
      case OrderStatus.FULFILLED:
        eventName = OUTBOX_EVENT_ORDER_FULFILLED;
        break;
      case OrderStatus.DELIVERED:
        eventName = OUTBOX_EVENT_ORDER_DELIVERED;
        break;
      case OrderStatus.CANCELLED:
        eventName = OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER;
        break;
      default:
        return;
    }
    const notification = await this.prisma.notificationOutbox.create({
      data: {
        eventName,
        channel: NotificationChannel.EMAIL,
        recipient: user.email,
        recipientUserId: user.id,
        payload: { orderId, firstName: user.firstName },
      },
    });
    await this.notificationOutboxDelivery.enqueueDelivery(notification.id);
  }
}
