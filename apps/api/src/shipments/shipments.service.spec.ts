import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ShipmentsService } from './shipments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import {
  OrderStatus,
  ShipmentStatus,
  ShipmentEventType,
} from '../generated/prisma/enums';
import {
  SHIPMENT_ALLOWED_TRANSITIONS,
  SHIPMENT_POLICY_VERSION,
  buildCarrierTrackingKey,
  isAllowedTrackingUrl,
  normalizeTrackingNumber,
} from './shipments.constants';
import { Prisma } from '../generated/prisma/client';

describe('shipments.constants', () => {
  it('normalizes tracking and builds carrier keys', () => {
    expect(normalizeTrackingNumber(' ab 12 ')).toBe('AB12');
    expect(buildCarrierTrackingKey('manual', 'ab 12')).toBe('MANUAL|AB12');
    expect(buildCarrierTrackingKey('DHL', null)).toBeNull();
  });

  it('allowlists https tracking hosts only', () => {
    expect(isAllowedTrackingUrl('https://tracking.dhl.com/track?id=1')).toBe(
      true,
    );
    expect(isAllowedTrackingUrl('http://tracking.dhl.com/track')).toBe(false);
    expect(isAllowedTrackingUrl('https://evil.example/phish')).toBe(false);
  });

  it('defines a closed transition matrix', () => {
    expect(SHIPMENT_ALLOWED_TRANSITIONS[ShipmentStatus.READY]).toEqual([
      ShipmentStatus.DISPATCHED,
      ShipmentStatus.CANCELLED,
    ]);
    expect(SHIPMENT_ALLOWED_TRANSITIONS[ShipmentStatus.DELIVERED]).toEqual([]);
  });
});

describe('ShipmentsService', () => {
  let service: ShipmentsService;
  let prisma: {
    order: { findUnique: jest.Mock; updateMany: jest.Mock };
    shipment: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    shipmentEvent: { create: jest.Mock; findFirst: jest.Mock };
    notificationOutbox: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let outbox: { enqueueDelivery: jest.Mock };
  let adminNotify: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      order: { findUnique: jest.fn(), updateMany: jest.fn() },
      shipment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shipmentEvent: { create: jest.fn(), findFirst: jest.fn() },
      notificationOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    outbox = { enqueueDelivery: jest.fn().mockResolvedValue(undefined) };
    adminNotify = { emit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationOutboxDeliveryService, useValue: outbox },
        { provide: AdminNotifyService, useValue: adminNotify },
      ],
    }).compile();

    service = module.get(ShipmentsService);
  });

  describe('createForOrder', () => {
    it('creates READY shipment and derives FULFILLED from PROCESSING', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PROCESSING,
        user: { id: 'u1', email: 'a@b.com', firstName: 'Ada' },
      });
      const created = {
        id: 'ship-1',
        orderId: 'order-1',
        status: ShipmentStatus.READY,
        events: [{ id: 'evt-1', type: ShipmentEventType.READY }],
      };
      prisma.shipment.create.mockResolvedValue(created);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.createForOrder(
        'order-1',
        { carrierCode: 'MANUAL', idempotencyKey: 'idem-create-1' },
        'admin-1',
      );

      expect(result.id).toBe('ship-1');
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: OrderStatus.PROCESSING },
        data: { status: OrderStatus.FULFILLED },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'admin.shipment.created',
          entityId: 'ship-1',
        }),
        prisma,
      );
      expect(outbox.enqueueDelivery).toHaveBeenCalled();
      expect(adminNotify.emit).toHaveBeenCalled();
    });

    it('rejects ineligible order status', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
        user: null,
      });

      await expect(
        service.createForOrder('order-1', { carrierCode: 'MANUAL' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps unique violation to conflict for second active outbound', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.FULFILLED,
        user: null,
      });
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createForOrder('order-1', { carrierCode: 'MANUAL' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateStatus', () => {
    const baseShipment = {
      id: 'ship-1',
      orderId: 'order-1',
      status: ShipmentStatus.READY,
      carrierCode: 'MANUAL',
      trackingNumber: null,
      trackingUrl: null,
      dispatchedAt: null,
      exceptionCode: null,
      exceptionMessageCustomer: null,
      exceptionNotesInternal: null,
      order: {
        id: 'order-1',
        status: OrderStatus.FULFILLED,
        user: { id: 'u1', email: 'a@b.com', firstName: 'Ada' },
      },
      events: [],
    };

    it('dispatches with tracking and audits', async () => {
      prisma.shipment.findUnique
        .mockResolvedValueOnce(baseShipment)
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.DISPATCHED,
          trackingNumber: 'TRK1',
          events: [],
        });
      prisma.shipmentEvent.create.mockResolvedValue({});
      prisma.shipment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateStatus(
        'ship-1',
        {
          status: 'DISPATCHED',
          idempotencyKey: 'idem-dispatch-1',
          trackingNumber: 'trk 1',
        },
        'admin-1',
      );

      expect(prisma.shipmentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: ShipmentEventType.DISPATCHED,
            idempotencyKey: 'idem-dispatch-1',
          }),
        }),
      );
      expect(prisma.shipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ship-1', status: ShipmentStatus.READY },
          data: expect.objectContaining({
            status: ShipmentStatus.DISPATCHED,
            trackingNumber: 'TRK1',
            carrierTrackingKey: 'MANUAL|TRK1',
          }),
        }),
      );
      expect(result.status).toBe(ShipmentStatus.DISPATCHED);
    });

    it('rejects dispatch without tracking', async () => {
      prisma.shipment.findUnique.mockResolvedValue(baseShipment);

      await expect(
        service.updateStatus(
          'ship-1',
          { status: 'DISPATCHED', idempotencyKey: 'idem-x' },
          'admin-1',
        ),
      ).rejects.toThrow(/trackingNumber/);
    });

    it('rejects illegal transitions', async () => {
      prisma.shipment.findUnique.mockResolvedValue(baseShipment);

      await expect(
        service.updateStatus(
          'ship-1',
          {
            status: 'DELIVERED',
            idempotencyKey: 'idem-y',
            trackingNumber: 'TRK1',
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('delivers and derives order DELIVERED', async () => {
      prisma.shipment.findUnique
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.OUT_FOR_DELIVERY,
          trackingNumber: 'TRK1',
          dispatchedAt: new Date(),
        })
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.DELIVERED,
          events: [],
        });
      prisma.shipmentEvent.create.mockResolvedValue({});
      prisma.shipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      await service.updateStatus(
        'ship-1',
        {
          status: 'DELIVERED',
          idempotencyKey: 'idem-deliver-1',
          trackingNumber: 'TRK1',
        },
        'admin-1',
      );

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: OrderStatus.FULFILLED },
        data: { status: OrderStatus.DELIVERED },
      });
      expect(outbox.enqueueDelivery).toHaveBeenCalled();
    });

    it('records EXCEPTION with taxonomy code', async () => {
      prisma.shipment.findUnique
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.IN_TRANSIT,
          trackingNumber: 'TRK1',
          dispatchedAt: new Date(),
        })
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.EXCEPTION,
          events: [],
        });
      prisma.shipmentEvent.create.mockResolvedValue({});
      prisma.shipment.updateMany.mockResolvedValue({ count: 1 });

      await service.updateStatus(
        'ship-1',
        {
          status: 'EXCEPTION',
          idempotencyKey: 'idem-ex-1',
          trackingNumber: 'TRK1',
          exceptionCode: 'LOST',
        },
        'admin-1',
      );

      expect(prisma.shipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ship-1', status: ShipmentStatus.IN_TRANSIT },
          data: expect.objectContaining({
            status: ShipmentStatus.EXCEPTION,
            exceptionCode: 'LOST',
            exceptionMessageCustomer:
              'We are investigating a missing shipment.',
          }),
        }),
      );
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('does not derive order status on CANCELLED', async () => {
      prisma.shipment.findUnique
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.READY,
        })
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.CANCELLED,
          events: [],
        });
      prisma.shipmentEvent.create.mockResolvedValue({});
      prisma.shipment.updateMany.mockResolvedValue({ count: 1 });

      await service.updateStatus(
        'ship-1',
        { status: 'CANCELLED', idempotencyKey: 'idem-cancel-1' },
        'admin-1',
      );

      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('rejects concurrent status claim misses', async () => {
      prisma.shipment.findUnique.mockResolvedValue({
        ...baseShipment,
        trackingNumber: 'TRK1',
      });
      prisma.shipmentEvent.create.mockResolvedValue({});
      prisma.shipment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus(
          'ship-1',
          {
            status: 'DISPATCHED',
            idempotencyKey: 'idem-race-1',
            trackingNumber: 'TRK1',
          },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('allows same-status correction on DELIVERED with supersedesEventId', async () => {
      prisma.shipment.findUnique
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.DELIVERED,
          trackingNumber: 'TRK1',
          deliveredAt: new Date(),
          events: [],
        })
        .mockResolvedValueOnce({
          ...baseShipment,
          status: ShipmentStatus.DELIVERED,
          events: [{ id: 'evt-corr' }],
        });
      prisma.shipmentEvent.findFirst.mockResolvedValue({
        id: 'evt-prior',
        shipmentId: 'ship-1',
      });
      prisma.shipmentEvent.create.mockResolvedValue({});
      prisma.shipment.updateMany.mockResolvedValue({ count: 1 });

      await service.updateStatus(
        'ship-1',
        {
          status: 'DELIVERED',
          idempotencyKey: 'idem-corr-1',
          trackingNumber: 'TRK1',
          supersedesEventId: 'evt-prior',
          correctionReason: 'Fixed customer message typo',
          customerMessage: 'Delivered to reception.',
        },
        'admin-1',
      );

      expect(prisma.shipmentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: ShipmentEventType.CORRECTION,
            supersedesEventId: 'evt-prior',
          }),
        }),
      );
      expect(prisma.shipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            deliveredAt: expect.anything(),
          }),
        }),
      );
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('returns existing shipment on duplicate idempotency key', async () => {
      prisma.shipment.findUnique
        .mockResolvedValueOnce({
          ...baseShipment,
          events: [{ id: 'evt-dup' }],
        })
        .mockResolvedValueOnce({
          ...baseShipment,
          events: [{ id: 'evt-dup' }],
        });

      const result = await service.updateStatus(
        'ship-1',
        {
          status: 'DISPATCHED',
          idempotencyKey: 'idem-dup',
          trackingNumber: 'TRK1',
        },
        'admin-1',
      );

      expect(prisma.shipmentEvent.create).not.toHaveBeenCalled();
      expect(result.id).toBe('ship-1');
    });

    it('rejects non-allowlisted tracking URL', async () => {
      prisma.shipment.findUnique.mockResolvedValue(baseShipment);

      await expect(
        service.updateStatus(
          'ship-1',
          {
            status: 'DISPATCHED',
            idempotencyKey: 'idem-url',
            trackingNumber: 'TRK1',
            trackingUrl: 'https://evil.example/x',
          },
          'admin-1',
        ),
      ).rejects.toThrow(/allowlist/);
    });
  });

  describe('customer summary', () => {
    it('returns null when no active shipment', async () => {
      prisma.shipment.findFirst.mockResolvedValue(null);
      await expect(
        service.getCustomerSummaryForOrder('order-1'),
      ).resolves.toBeNull();
    });

    it('redacts tracking while READY and omits private notes', async () => {
      prisma.shipment.findFirst.mockResolvedValue({
        id: 'ship-1',
        status: ShipmentStatus.READY,
        carrierName: 'Manual dispatch',
        carrierCode: 'MANUAL',
        trackingNumber: 'SECRET',
        trackingUrl: 'https://tracking.dhl.com/x',
        estimatedDeliveryAt: null,
        exceptionCode: null,
        exceptionMessageCustomer: null,
        policyVersion: SHIPMENT_POLICY_VERSION,
        events: [
          {
            id: 'evt-1',
            type: ShipmentEventType.READY,
            occurredAt: new Date('2026-08-21T00:00:00.000Z'),
            customerMessage: 'Ready',
            exceptionCode: null,
            privateNotes: 'internal',
          },
        ],
      });

      const summary = await service.getCustomerSummaryForOrder('order-1');
      expect(summary?.trackingNumber).toBeNull();
      expect(summary?.trackingUrl).toBeNull();
      expect(JSON.stringify(summary)).not.toMatch(/privateNotes|SECRET/);
    });

    it('exposes tracking after dispatch', () => {
      const summary = service.toCustomerSummary({
        id: 'ship-1',
        status: ShipmentStatus.DISPATCHED,
        carrierName: 'DHL',
        carrierCode: 'DHL',
        trackingNumber: 'TRK1',
        trackingUrl: 'https://tracking.dhl.com/x',
        estimatedDeliveryAt: new Date('2026-08-25T00:00:00.000Z'),
        exceptionCode: null,
        exceptionMessageCustomer: null,
        policyVersion: SHIPMENT_POLICY_VERSION,
        events: [],
      });
      expect(summary.trackingNumber).toBe('TRK1');
      expect(summary.trackingUrl).toContain('tracking.dhl.com');
    });
  });

  describe('admin getters', () => {
    it('throws when shipment missing', async () => {
      prisma.shipment.findUnique.mockResolvedValue(null);
      await expect(service.getForAdmin('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lists shipments for an order', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1' });
      prisma.shipment.findMany.mockResolvedValue([{ id: 'ship-1' }]);
      await expect(service.listForOrderAdmin('order-1')).resolves.toEqual([
        { id: 'ship-1' },
      ]);
    });
  });
});
