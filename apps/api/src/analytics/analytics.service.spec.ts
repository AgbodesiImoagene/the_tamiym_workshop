import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: jest.Mocked<PrismaService>;

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
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get(PrismaService);
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
});
