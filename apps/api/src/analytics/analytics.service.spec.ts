import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import { AuditService } from '../audit/audit.service';
import { ANALYTICS_KPI_POLICY_VERSION } from './analytics-contract';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: jest.Mocked<PrismaService>;
  let campaignLedger: jest.Mocked<CampaignLedgerService>;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = {
      order: {
        count: jest.fn().mockResolvedValue(10),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalAmount: 50000 },
          _count: { _all: 3 },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      campaign: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { currentAmount: 0 } }),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 40000 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      refund: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 5000 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payoutRun: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      payout: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      campaignBalanceLedgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      reconciliationRun: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      reconciliationFinding: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockCampaignLedger = {
      getEligibleBalance: jest.fn().mockResolvedValue(0),
    };

    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CampaignLedgerService, useValue: mockCampaignLedger },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get(PrismaService);
    campaignLedger = module.get(CampaignLedgerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOverview', () => {
    it('returns catalogue metrics and meta', async () => {
      const result = await service.getOverview({});

      expect(result.metrics.settledRevenue).toBe(40000);
      expect(result.metrics.refundedValue).toBe(5000);
      expect(result.metrics.netRevenue).toBe(35000);
      expect(result.totalRevenue).toBe(40000);
      expect(result.meta.definitionVersion).toBe(ANALYTICS_KPI_POLICY_VERSION);
      expect(result.meta.timezone).toBe('Africa/Lagos');
      expect(prisma.payment.aggregate).toHaveBeenCalled();
      expect(prisma.refund.aggregate).toHaveBeenCalled();
    });

    it('applies Lagos date window and campaign filter', async () => {
      await service.getOverview({
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
        campaignId: 'camp-1',
      });

      expect(prisma.order.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          campaignId: 'camp-1',
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lt: expect.any(Date),
          }),
        }),
      });
    });

    it('rejects reversed windows', async () => {
      await expect(
        service.getOverview({ dateFrom: '2025-02-01', dateTo: '2025-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unsupported currency', async () => {
      await expect(
        service.getOverview({ currency: 'USD' as never }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('exportOrdersCsv', () => {
    it('returns CSV string with headers and audits', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.exportOrdersCsv({}, 'admin-1');

      expect(result).toContain('id,userId,email,firstName,lastName,status');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'admin.analytics.export',
          entityId: 'orders',
        }),
      );
    });

    it('rejects unknown export entity via exportCsv', async () => {
      await expect(
        service.exportCsv({ entity: 'payouts' as never }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects exports that exceed the row cap', async () => {
      (prisma.order.count as jest.Mock).mockResolvedValue(10_001);
      await expect(
        service.exportOrdersCsv({}, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('exportCampaignsCsv', () => {
    it('returns CSV string with headers', async () => {
      (prisma.campaign.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.exportCampaignsCsv({});

      expect(result).toContain('id,organizerId,organizerEmail');
      expect(prisma.campaign.findMany).toHaveBeenCalled();
    });
  });

  describe('getMoneyMetrics', () => {
    it('returns money metrics with catalogue + meta', async () => {
      (prisma.campaign.aggregate as jest.Mock).mockResolvedValue({
        _sum: { currentAmount: 1000 },
      });
      (
        prisma.campaignBalanceLedgerEntry.aggregate as jest.Mock
      ).mockResolvedValue({ _sum: { amount: 800 } });
      (prisma.payoutRun.groupBy as jest.Mock).mockResolvedValue([
        { status: 'COMPLETED', _count: { _all: 2 } },
        { status: 'DRAFT', _count: { _all: 1 } },
      ]);
      (prisma.payout.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amount: 2500 },
      });
      (prisma.payout.groupBy as jest.Mock).mockResolvedValue([
        { status: 'SUCCEEDED', _count: { _all: 4 } },
      ]);

      const result = await service.getMoneyMetrics({});

      expect(result.campaignsGrossRaisedSum).toBe(1000);
      expect(result.ledgerEligibleTotal).toBe(800);
      expect(result.payoutsSucceededAmount).toBe(2500);
      expect(result.metrics.paidOutValue).toBe(2500);
      expect(result.meta.definitionVersion).toBe(ANALYTICS_KPI_POLICY_VERSION);
      expect(result.currency).toBe('NGN');
    });
  });

  describe('getCampaignFundraisingSnapshot', () => {
    it('should throw when campaign missing', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.getCampaignFundraisingSnapshot('missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return snapshot with ledger and orders + meta', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        id: 'c1',
        title: 'Test',
        slug: 'test',
        status: 'ACTIVE',
        currency: 'NGN',
        goalAmount: 5000,
        currentAmount: 2000,
      });
      (campaignLedger.getEligibleBalance as jest.Mock).mockResolvedValue(1500);
      (prisma.order.aggregate as jest.Mock).mockResolvedValue({
        _count: { _all: 3 },
        _sum: { totalAmount: 2000 },
      });

      const result = await service.getCampaignFundraisingSnapshot('c1');

      expect(result.eligibleBalanceLedger).toBe(1500);
      expect(result.paidOrdersCount).toBe(3);
      expect(result.paidOrdersTotal).toBe(2000);
      expect(result.currentAmountGross).toBe(2000);
      expect(result.meta.definitionVersion).toBe(ANALYTICS_KPI_POLICY_VERSION);
      expect(campaignLedger.getEligibleBalance).toHaveBeenCalledWith('c1');
    });
  });

  describe('drilldowns', () => {
    it('returns paginated orders without PII', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'o1',
          status: 'PAID',
          paymentStatus: 'SUCCEEDED',
          totalAmount: 100,
          currency: 'NGN',
          campaignId: null,
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
        },
      ]);

      const result = await service.drilldownOrders({ take: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).not.toHaveProperty('email');
      expect(result.meta.definitionVersion).toBe(ANALYTICS_KPI_POLICY_VERSION);
    });

    it('returns settlements and refunds', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p1',
          orderId: 'o1',
          amount: 100,
          currency: 'NGN',
          status: 'SUCCEEDED',
          providerRef: 'ref',
          settlementClaim: { createdAt: new Date() },
        },
      ]);
      (prisma.refund.findMany as jest.Mock).mockResolvedValue([]);

      const settlements = await service.drilldownSettlements({});
      const refunds = await service.drilldownRefunds({});
      expect(settlements.items[0]?.id).toBe('p1');
      expect(refunds.items).toEqual([]);
    });

    it('returns reconciliation findings', async () => {
      (prisma.reconciliationFinding.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'f1',
          runId: 'r1',
          domain: 'PAYMENT',
          outcome: 'MISMATCH',
          severity: 'HIGH',
          status: 'OPEN',
          fingerprint: 'abc',
          leftLabel: 'internal',
          leftValue: '100',
          rightLabel: 'provider',
          rightValue: '90',
          currency: 'NGN',
          createdAt: new Date(),
        },
      ]);

      const result = await service.drilldownReconciliation({});
      expect(result.items[0]?.id).toBe('f1');
    });
  });
});
