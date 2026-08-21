import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import {
  AuditAction,
  AuditSource,
  NotificationChannel,
  OrderStatus,
  ShipmentDirection,
  ShipmentEventType,
  ShipmentStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import {
  OUTBOX_EVENT_ORDER_DELIVERED,
  OUTBOX_EVENT_ORDER_FULFILLED,
} from '../mail/mail-outbox-templates';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { ADMIN_NOTIF_ORDER_STATUS_CHANGED } from '../admin-notifications/admin-notification-events';
import type { CreateShipmentDto } from './dto/create-shipment.dto';
import type { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import type { CustomerShipmentSummaryDto } from './dto/customer-shipment-summary.dto';
import {
  SHIPMENT_ALLOWED_TRANSITIONS,
  SHIPMENT_CARRIER_DISPLAY_NAME,
  SHIPMENT_EXCEPTION_CODES,
  SHIPMENT_POLICY_VERSION,
  buildCarrierTrackingKey,
  customerMessageForException,
  isAllowedTrackingUrl,
  normalizeTrackingNumber,
  type ShipmentCarrierCode,
  type ShipmentExceptionCode,
} from './shipments.constants';

const ORDER_CREATABLE = new Set<OrderStatus>([
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
]);

const TRACKING_REQUIRED = new Set<ShipmentStatus>([
  ShipmentStatus.DISPATCHED,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
  ShipmentStatus.EXCEPTION,
]);

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notificationOutboxDelivery: NotificationOutboxDeliveryService,
    private readonly adminNotify: AdminNotifyService,
  ) {}

  /**
   * Create the v1 active outbound shipment for an order (READY).
   * Derives order FULFILLED when the order was PROCESSING.
   */
  async createForOrder(
    orderId: string,
    dto: CreateShipmentDto,
    actorUserId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        user: { select: { id: true, email: true, firstName: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!ORDER_CREATABLE.has(order.status)) {
      throw new BadRequestException(
        `Cannot create a shipment while order status is ${order.status}`,
      );
    }

    const carrierCode = dto.carrierCode as ShipmentCarrierCode;
    const carrierName = SHIPMENT_CARRIER_DISPLAY_NAME[carrierCode];
    const idempotencyKey = dto.idempotencyKey?.trim() || randomUUID();
    const estimatedDeliveryAt = dto.estimatedDeliveryAt
      ? new Date(dto.estimatedDeliveryAt)
      : null;
    if (estimatedDeliveryAt && Number.isNaN(estimatedDeliveryAt.getTime())) {
      throw new BadRequestException('estimatedDeliveryAt is invalid');
    }

    let derivedOrderStatus: OrderStatus | null = null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.create({
          data: {
            orderId,
            direction: ShipmentDirection.OUTBOUND,
            status: ShipmentStatus.READY,
            carrierCode,
            carrierName,
            serviceCode: dto.serviceCode?.trim() || null,
            estimatedDeliveryAt,
            policyVersion: SHIPMENT_POLICY_VERSION,
            events: {
              create: {
                type: ShipmentEventType.READY,
                actorUserId,
                source: AuditSource.ADMIN_API,
                idempotencyKey,
                privateNotes: dto.privateNotes?.trim() || null,
                customerMessage: 'Your order is ready for dispatch.',
              },
            },
          },
          include: {
            events: { orderBy: { occurredAt: 'asc' } },
          },
        });

        if (order.status === OrderStatus.PROCESSING) {
          const updated = await tx.order.updateMany({
            where: { id: orderId, status: OrderStatus.PROCESSING },
            data: { status: OrderStatus.FULFILLED },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              'Order status changed; shipment create aborted',
            );
          }
          derivedOrderStatus = OrderStatus.FULFILLED;
        }

        await this.audit.log(
          {
            eventName: 'admin.shipment.created',
            action: AuditAction.CREATE,
            entityType: 'Shipment',
            entityId: shipment.id,
            targetType: 'Order',
            targetId: orderId,
            actorUserId,
            source: AuditSource.ADMIN_API,
            after: {
              status: shipment.status,
              carrierCode,
              orderStatus: derivedOrderStatus ?? order.status,
            },
            metadata: { policyVersion: SHIPMENT_POLICY_VERSION },
            note: `Admin created shipment for order ${orderId}`,
          },
          tx,
        );

        return shipment;
      });

      if (derivedOrderStatus === OrderStatus.FULFILLED) {
        await this.queueOrderStatusEmail(
          orderId,
          order.user,
          OrderStatus.FULFILLED,
        );
        await this.adminNotify.emit(ADMIN_NOTIF_ORDER_STATUS_CHANGED, {
          orderId,
          previousStatus: OrderStatus.PROCESSING,
          newStatus: OrderStatus.FULFILLED,
          actorUserId,
        });
      }

      return result;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Order already has an active outbound shipment',
        );
      }
      throw err;
    }
  }

  /**
   * Append a status transition event and update shipment (+ derived order) state.
   */
  async updateStatus(
    shipmentId: string,
    dto: UpdateShipmentStatusDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            user: { select: { id: true, email: true, firstName: true } },
          },
        },
        events: {
          where: { idempotencyKey: dto.idempotencyKey },
          take: 1,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Shipment not found');
    }

    if (existing.events[0]) {
      return this.getForAdmin(shipmentId);
    }

    const nextStatus = dto.status as ShipmentStatus;
    const allowed = SHIPMENT_ALLOWED_TRANSITIONS[existing.status];
    const isSameStatusCorrection =
      !!dto.supersedesEventId && nextStatus === existing.status;
    if (!isSameStatusCorrection && !allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Transition from ${existing.status} to ${nextStatus} is not allowed`,
      );
    }

    if (dto.supersedesEventId) {
      if (!dto.correctionReason?.trim()) {
        throw new BadRequestException(
          'correctionReason is required when supersedesEventId is set',
        );
      }
      const prior = await this.prisma.shipmentEvent.findFirst({
        where: { id: dto.supersedesEventId, shipmentId },
      });
      if (!prior) {
        throw new BadRequestException(
          'supersedesEventId does not exist on this shipment',
        );
      }
    }

    const trackingNumber =
      dto.trackingNumber?.trim() || existing.trackingNumber || null;
    if (
      TRACKING_REQUIRED.has(nextStatus) &&
      nextStatus !== ShipmentStatus.CANCELLED &&
      !trackingNumber
    ) {
      throw new BadRequestException(
        'trackingNumber is required for this shipment status',
      );
    }

    let trackingUrl = dto.trackingUrl?.trim() || existing.trackingUrl || null;
    if (dto.trackingUrl?.trim()) {
      if (!isAllowedTrackingUrl(dto.trackingUrl.trim())) {
        throw new BadRequestException(
          'trackingUrl host is not on the interim allowlist',
        );
      }
      trackingUrl = dto.trackingUrl.trim();
    }

    let exceptionCode: string | null = existing.exceptionCode;
    let exceptionMessageCustomer: string | null =
      existing.exceptionMessageCustomer;
    let exceptionNotesInternal: string | null = existing.exceptionNotesInternal;
    let customerMessage: string | null = dto.customerMessage?.trim() || null;
    let eventType: ShipmentEventType = nextStatus as ShipmentEventType;

    if (nextStatus === ShipmentStatus.EXCEPTION) {
      if (
        !dto.exceptionCode ||
        !SHIPMENT_EXCEPTION_CODES.includes(
          dto.exceptionCode as ShipmentExceptionCode,
        )
      ) {
        throw new BadRequestException(
          'exceptionCode is required for EXCEPTION status',
        );
      }
      exceptionCode = dto.exceptionCode;
      exceptionMessageCustomer = customerMessageForException(
        dto.exceptionCode as ShipmentExceptionCode,
        dto.customerMessage,
      );
      customerMessage = exceptionMessageCustomer;
      exceptionNotesInternal = dto.privateNotes?.trim() || null;
    } else if (nextStatus !== ShipmentStatus.CANCELLED) {
      // Clearing an exception on recovery / progress
      if (existing.status === ShipmentStatus.EXCEPTION) {
        exceptionCode = null;
        exceptionMessageCustomer = null;
        exceptionNotesInternal = null;
      }
    }

    if (dto.supersedesEventId) {
      eventType = ShipmentEventType.CORRECTION;
      if (!customerMessage) {
        customerMessage = `Shipment status updated to ${nextStatus}.`;
      }
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('occurredAt is invalid');
    }

    const carrierTrackingKey = buildCarrierTrackingKey(
      existing.carrierCode,
      trackingNumber,
    );

    const shipmentData: Prisma.ShipmentUpdateInput = {
      status: nextStatus,
      trackingNumber: trackingNumber
        ? normalizeTrackingNumber(trackingNumber)
        : null,
      trackingUrl,
      carrierTrackingKey,
      exceptionCode,
      exceptionMessageCustomer,
      exceptionNotesInternal:
        dto.privateNotes?.trim() ?? exceptionNotesInternal,
    };

    if (nextStatus === ShipmentStatus.DISPATCHED && !existing.dispatchedAt) {
      shipmentData.dispatchedAt = occurredAt;
    } else if (
      !existing.dispatchedAt &&
      (nextStatus === ShipmentStatus.IN_TRANSIT ||
        nextStatus === ShipmentStatus.OUT_FOR_DELIVERY ||
        nextStatus === ShipmentStatus.DELIVERED) &&
      existing.status !== nextStatus
    ) {
      shipmentData.dispatchedAt = occurredAt;
    }

    if (
      nextStatus === ShipmentStatus.DELIVERED &&
      existing.status !== ShipmentStatus.DELIVERED
    ) {
      shipmentData.deliveredAt = occurredAt;
    }

    let derivedOrderStatus: OrderStatus | null = null;
    const previousOrderStatus = existing.order.status;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.shipmentEvent.create({
          data: {
            shipmentId,
            type: eventType,
            occurredAt,
            actorUserId,
            source: AuditSource.ADMIN_API,
            idempotencyKey: dto.idempotencyKey,
            customerMessage,
            privateNotes: dto.privateNotes?.trim() || null,
            exceptionCode:
              nextStatus === ShipmentStatus.EXCEPTION ? exceptionCode : null,
            supersedesEventId: dto.supersedesEventId || null,
            metadata: dto.correctionReason
              ? { correctionReason: dto.correctionReason.trim() }
              : undefined,
          },
        });

        const claimed = await tx.shipment.updateMany({
          where: { id: shipmentId, status: existing.status },
          data: shipmentData,
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Shipment status changed concurrently; retry with the latest status',
          );
        }

        if (
          nextStatus === ShipmentStatus.DELIVERED &&
          existing.status !== ShipmentStatus.DELIVERED &&
          existing.order.status !== OrderStatus.DELIVERED
        ) {
          if (existing.order.status !== OrderStatus.FULFILLED) {
            throw new BadRequestException(
              `Order must be FULFILLED before delivery (current: ${existing.order.status})`,
            );
          }
          const updated = await tx.order.updateMany({
            where: { id: existing.orderId, status: OrderStatus.FULFILLED },
            data: { status: OrderStatus.DELIVERED },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              'Order status changed; delivery aborted',
            );
          }
          derivedOrderStatus = OrderStatus.DELIVERED;
        }

        await this.audit.log(
          {
            eventName: 'admin.shipment.status.updated',
            action: AuditAction.STATUS_CHANGE,
            entityType: 'Shipment',
            entityId: shipmentId,
            targetType: 'Order',
            targetId: existing.orderId,
            actorUserId,
            source: AuditSource.ADMIN_API,
            before: { status: existing.status },
            after: {
              status: nextStatus,
              exceptionCode,
              orderStatus: derivedOrderStatus ?? existing.order.status,
            },
            metadata: {
              policyVersion: SHIPMENT_POLICY_VERSION,
              idempotencyKey: dto.idempotencyKey,
              correctionReason: dto.correctionReason?.trim() || null,
            },
            note:
              dto.correctionReason?.trim() ||
              `Admin updated shipment ${shipmentId} to ${nextStatus}`,
          },
          tx,
        );
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Concurrent duplicate idempotency or tracking key
        const again = await this.prisma.shipmentEvent.findFirst({
          where: { shipmentId, idempotencyKey: dto.idempotencyKey },
        });
        if (again) {
          return this.getForAdmin(shipmentId);
        }
        throw new ConflictException(
          'Tracking number already used for this carrier',
        );
      }
      throw err;
    }

    if (derivedOrderStatus === OrderStatus.DELIVERED) {
      await this.queueOrderStatusEmail(
        existing.orderId,
        existing.order.user,
        OrderStatus.DELIVERED,
      );
      await this.adminNotify.emit(ADMIN_NOTIF_ORDER_STATUS_CHANGED, {
        orderId: existing.orderId,
        previousStatus: previousOrderStatus,
        newStatus: OrderStatus.DELIVERED,
        actorUserId,
      });
    }

    return this.getForAdmin(shipmentId);
  }

  async getForAdmin(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }
    return shipment;
  }

  async listForOrderAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.prisma.shipment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
      },
    });
  }

  /**
   * Customer-safe redacted shipment for an owned order, or null when absent.
   */
  async getCustomerSummaryForOrder(
    orderId: string,
  ): Promise<CustomerShipmentSummaryDto | null> {
    const shipment = await this.prisma.shipment.findFirst({
      where: {
        orderId,
        direction: ShipmentDirection.OUTBOUND,
        status: { not: ShipmentStatus.CANCELLED },
      },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!shipment) return null;
    return this.toCustomerSummary(shipment);
  }

  toCustomerSummary(shipment: {
    id: string;
    status: ShipmentStatus;
    carrierName: string | null;
    carrierCode: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    estimatedDeliveryAt: Date | null;
    exceptionCode: string | null;
    exceptionMessageCustomer: string | null;
    policyVersion: string;
    events: Array<{
      id: string;
      type: ShipmentEventType;
      occurredAt: Date;
      customerMessage: string | null;
      exceptionCode: string | null;
    }>;
  }): CustomerShipmentSummaryDto {
    const showTracking =
      shipment.status !== ShipmentStatus.READY &&
      shipment.status !== ShipmentStatus.CANCELLED;

    return {
      policyVersion: shipment.policyVersion || SHIPMENT_POLICY_VERSION,
      id: shipment.id,
      status: shipment.status,
      carrierName:
        shipment.carrierName ||
        SHIPMENT_CARRIER_DISPLAY_NAME[
          shipment.carrierCode as ShipmentCarrierCode
        ] ||
        shipment.carrierCode,
      trackingNumber: showTracking ? shipment.trackingNumber : null,
      trackingUrl: showTracking ? shipment.trackingUrl : null,
      estimatedDeliveryAt: shipment.estimatedDeliveryAt
        ? shipment.estimatedDeliveryAt.toISOString()
        : null,
      exceptionCode: shipment.exceptionCode,
      exceptionMessage: shipment.exceptionMessageCustomer,
      events: shipment.events.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        customerMessage: event.customerMessage,
        exceptionCode: event.exceptionCode,
      })),
    };
  }

  private async queueOrderStatusEmail(
    orderId: string,
    user: { id: string; email: string; firstName: string } | null | undefined,
    newStatus: OrderStatus,
  ): Promise<void> {
    if (!user?.email) return;
    const eventName =
      newStatus === OrderStatus.FULFILLED
        ? OUTBOX_EVENT_ORDER_FULFILLED
        : newStatus === OrderStatus.DELIVERED
          ? OUTBOX_EVENT_ORDER_DELIVERED
          : null;
    if (!eventName) return;
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
