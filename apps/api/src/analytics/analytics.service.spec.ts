import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: jest.Mocked<PrismaService>;
  let campaignLedger: jest.Mocked<CampaignLedgerService>;

  beforeEach(async () => {
    const mockPrisma = {
      order: {
        count: jest.fn().mockResolvedValue(10),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { totalAmount: 50000 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      campaign: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { currentAmount: 0 } }),
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
      },
      campaignBalanceLedgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    };

    const mockCampaignLedger = {
      getEligibleBalance: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CampaignLedgerService, useValue: mockCampaignLedger },
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
    it('should return overview metrics', async () => {
      const result = await service.getOverview();

      expect(prisma.order.count).toHaveBeenCalled();
      expect(prisma.order.aggregate).toHaveBeenCalled();
      expect(prisma.campaign.count).toHaveBeenCalled();
      expect(result.ordersCount).toBe(10);
      expect(result.totalRevenue).toBe(50000);
      expect(result.currency).toBe('NGN');
    });

    it('should apply date filter when provided', async () => {
      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-01-31');

      await service.getOverview(dateFrom, dateTo);

      expect(prisma.order.count).toHaveBeenCalledWith({
        where: {
          createdAt: { gte: dateFrom, lte: dateTo },
        },
      });
    });
  });

  describe('exportOrdersCsv', () => {
    it('should return CSV string with headers', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.exportOrdersCsv();

      expect(result).toContain('id,userId,email,firstName,lastName,status');
      expect(prisma.order.findMany).toHaveBeenCalled();
    });
  });

  describe('exportCampaignsCsv', () => {
    it('should return CSV string with headers', async () => {
      (prisma.campaign.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.exportCampaignsCsv();

      expect(result).toContain('id,organizerId,organizerEmail');
      expect(prisma.campaign.findMany).toHaveBeenCalled();
    });
  });

  describe('getMoneyMetrics', () => {
    it('should return money metrics with status maps', async () => {
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

      const result = await service.getMoneyMetrics();

      expect(result.campaignsGrossRaisedSum).toBe(1000);
      expect(result.ledgerEligibleTotal).toBe(800);
      expect(result.payoutsSucceededAmount).toBe(2500);
      expect(result.payoutRunsByStatus).toEqual({
        COMPLETED: 2,
        DRAFT: 1,
      });
      expect(result.payoutsByStatus).toEqual({ SUCCEEDED: 4 });
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

    it('should return snapshot with ledger and orders', async () => {
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
      expect(campaignLedger.getEligibleBalance).toHaveBeenCalledWith('c1');
    });
  });
});
