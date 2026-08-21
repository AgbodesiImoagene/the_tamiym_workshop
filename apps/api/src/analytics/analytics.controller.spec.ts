import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { StreamableFile } from '@nestjs/common';
import { ANALYTICS_KPI_POLICY_VERSION } from './analytics-contract';

const mockOverview = {
  ordersCount: 10,
  ordersPaidCount: 5,
  totalRevenue: 50000,
  currency: 'NGN',
  campaignsCount: 3,
  campaignsActiveCount: 1,
  meta: {
    definitionVersion: ANALYTICS_KPI_POLICY_VERSION,
    generatedAt: '2026-08-21T12:00:00.000Z',
    dataCutoffAt: '2026-08-21T12:00:00.000Z',
    timezone: 'Africa/Lagos',
    currency: 'NGN',
    appliedFilters: { currency: 'NGN' },
    freshness: {
      status: 'UNKNOWN',
      sloMs: 1,
      lastReconciliationFinishedAt: null,
    },
  },
  metrics: {
    orderCount: 10,
    orderPaidCount: 5,
    grossOrderValue: 60000,
    settledRevenue: 50000,
    refundedValue: 0,
    netRevenue: 50000,
    activeCampaignCount: 1,
    campaignsCreatedCount: 3,
  },
  definitions: {
    version: ANALYTICS_KPI_POLICY_VERSION,
    settledRevenue: 'x',
    grossOrderValue: 'y',
    netRevenue: 'z',
  },
};

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: jest.Mocked<AnalyticsService>;

  beforeEach(async () => {
    const mockAnalyticsService = {
      getOverview: jest.fn(),
      exportOrdersCsv: jest.fn(),
      exportCampaignsCsv: jest.fn(),
      exportCsv: jest.fn(),
      getPayoutOverview: jest.fn(),
      getMoneyMetrics: jest.fn(),
      getCampaignFundraisingSnapshot: jest.fn(),
      drilldownOrders: jest.fn(),
      drilldownSettlements: jest.fn(),
      drilldownRefunds: jest.fn(),
      drilldownPayouts: jest.fn(),
      drilldownReconciliation: jest.fn(),
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
      analyticsService.getOverview.mockResolvedValue(mockOverview as never);

      const result = await controller.getOverview({});

      expect(analyticsService.getOverview).toHaveBeenCalledWith({});
      expect(result).toEqual(mockOverview);
    });

    it('should pass filter contract to service', async () => {
      analyticsService.getOverview.mockResolvedValue(mockOverview as never);

      await controller.getOverview({
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
        campaignId: 'c1',
        productId: 'p1',
      });

      expect(analyticsService.getOverview).toHaveBeenCalledWith({
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
        campaignId: 'c1',
        productId: 'p1',
      });
    });
  });

  describe('drilldowns', () => {
    it('delegates order drill-down', async () => {
      analyticsService.drilldownOrders.mockResolvedValue({
        items: [],
        nextCursor: null,
        meta: mockOverview.meta,
      } as never);
      await controller.drilldownOrders({ take: 10 });
      expect(analyticsService.drilldownOrders).toHaveBeenCalledWith({
        take: 10,
      });
    });

    it('delegates reconciliation drill-down', async () => {
      analyticsService.drilldownReconciliation.mockResolvedValue({
        items: [],
        nextCursor: null,
        meta: mockOverview.meta,
      } as never);
      await controller.drilldownReconciliation({});
      expect(analyticsService.drilldownReconciliation).toHaveBeenCalled();
    });
  });

  describe('exportCsv', () => {
    it('should return StreamableFile for orders export', async () => {
      analyticsService.exportCsv.mockResolvedValue({
        entity: 'orders',
        csv: 'id,userId\norder-1,user-1',
      });
      const res = { set: jest.fn() } as unknown as import('express').Response;
      const user = {
        id: 'admin-1',
      } as import('../auth/strategies/jwt.strategy').RequestUser;

      const result = await controller.exportCsv(
        { entity: 'orders' },
        user,
        res,
      );

      expect(analyticsService.exportCsv).toHaveBeenCalledWith(
        { entity: 'orders' },
        'admin-1',
      );
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
