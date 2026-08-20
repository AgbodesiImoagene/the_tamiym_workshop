import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { ADMIN_NOTIF_ORDER_PENDING_EXPIRED } from '../admin-notifications/admin-notification-events';
import { RefundsService } from './refunds.service';

/**
 * Scheduled task: expire PENDING_PAYMENT orders whose expiresAt has passed.
 * Marks them CANCELLED, sets cancelledAt, and releases reserved inventory.
 * Also sweeps stale INITIATED refund reservations (TTW-013).
 * Runs every 5 minutes.
 */
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: ObservabilityService,
    private readonly adminNotify: AdminNotifyService,
    private readonly refundsService: RefundsService,
  ) {}

  @Cron('*/5 * * * *')
  async expirePendingOrders() {
    const now = new Date();
    return runWithRequestContext(
      {
        requestId: `cron:order-expiry:${now.toISOString()}`,
        source: 'CRON',
      },
      () =>
        this.observability.startSpan(
          'cron.orders.expire_pending',
          {},
          async () => {
            await this.refundsService.failStaleInitiatedRefunds(now);

            const expired = await this.prisma.order.findMany({
              where: {
                status: OrderStatus.PENDING_PAYMENT,
                expiresAt: { lt: now, not: null },
              },
              select: {
                id: true,
                items: { select: { variantId: true, quantity: true } },
              },
            });

            if (expired.length === 0) return;

            let cancelledCount = 0;
            const skippedIds: string[] = [];

            for (const order of expired) {
              // Guard: if a payment is already in flight (INITIATED/PROCESSING),
              // skip cancellation. When Paystack's webhook arrives it will be
              // rejected with an admin alert (C4 fix). Cancelling now would leave
              // the order in a permanently inconsistent state.
              const inflightPayment = await this.prisma.payment.findFirst({
                where: {
                  orderId: order.id,
                  status: {
                    in: [PaymentStatus.INITIATED],
                  },
                },
                select: { id: true, status: true, providerRef: true },
              });
              if (inflightPayment) {
                this.logger.warn(
                  `Skipping expiry of order ${order.id}: payment ${inflightPayment.id} ` +
                    `is still ${inflightPayment.status} (ref: ${inflightPayment.providerRef ?? 'n/a'}). ` +
                    `Order will be cancelled once the payment webhook settles.`,
                );
                skippedIds.push(order.id);
                continue;
              }

              await this.prisma.$transaction(async (tx) => {
                await tx.order.update({
                  where: { id: order.id },
                  data: {
                    status: OrderStatus.CANCELLED,
                    cancelledAt: now,
                  },
                });
                for (const item of order.items) {
                  const inv = await tx.inventoryItem.findUnique({
                    where: { variantId: item.variantId },
                  });
                  if (inv?.trackInventory) {
                    await tx.inventoryItem.update({
                      where: { variantId: item.variantId },
                      data: { reserved: { decrement: item.quantity } },
                    });
                  }
                }
              });
              cancelledCount++;
            }

            const cancelledIds = expired
              .map((o) => o.id)
              .filter((id) => !skippedIds.includes(id));
            const orderIdsPreview =
              cancelledIds.slice(0, 12).join(', ') +
              (cancelledIds.length > 12 ? ' …' : '');

            if (cancelledCount > 0) {
              await this.adminNotify.emit(ADMIN_NOTIF_ORDER_PENDING_EXPIRED, {
                count: cancelledCount,
                orderIdsPreview,
              });
              this.logger.log(
                `Expired ${cancelledCount} pending order(s) and released inventory`,
              );
            }
            if (skippedIds.length > 0) {
              this.logger.warn(
                `Skipped ${skippedIds.length} order(s) with in-flight payments: ${skippedIds.join(', ')}`,
              );
            }
          },
        ),
    );
  }
}
