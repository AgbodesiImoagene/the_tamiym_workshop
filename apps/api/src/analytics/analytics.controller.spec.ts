import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { StreamableFile } from '@nestjs/common';

const mockOverview = {
  ordersCount: 10,
  ordersPaidCount: 5,
  totalRevenue: 50000,
  currency: 'NGN',
  campaignsCount: 3,
  campaignsActiveCount: 1,
};

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: jest.Mocked<AnalyticsService>;

  beforeEach(async () => {
    const mockAnalyticsService = {
      getOverview: jest.fn(),
      exportOrdersCsv: jest.fn(),
      exportCampaignsCsv: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    analyticsService = module.get(AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOverview', () => {
    it('should return overview metrics', async () => {
      analyticsService.getOverview.mockResolvedValue(mockOverview);

      const result = await controller.getOverview({});

      expect(analyticsService.getOverview).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
      expect(result).toEqual(mockOverview);
    });

    it('should pass date range to service', async () => {
      analyticsService.getOverview.mockResolvedValue(mockOverview);

      await controller.getOverview({
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      });

      expect(analyticsService.getOverview).toHaveBeenCalledWith(
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );
    });
  });

  describe('exportCsv', () => {
    it('should return StreamableFile for orders export', async () => {
      analyticsService.exportOrdersCsv.mockResolvedValue(
        'id,userId\norder-1,user-1',
      );
      const res = { set: jest.fn() } as any;

      const result = await controller.exportCsv({ entity: 'orders' }, res);

      expect(analyticsService.exportOrdersCsv).toHaveBeenCalled();
      expect(result).toBeInstanceOf(StreamableFile);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv',
          'Content-Disposition': expect.stringContaining('orders-export'),
        }),
      );
    });
  });
});
