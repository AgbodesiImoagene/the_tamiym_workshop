import { Test, TestingModule } from '@nestjs/testing';
import { CampaignLedgerService } from './campaign-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerEntryType } from '../generated/prisma/enums';

describe('CampaignLedgerService', () => {
  let service: CampaignLedgerService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      siteSettings: { findUnique: jest.fn() },
      campaignBalanceLedgerEntry: {
        create: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignLedgerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CampaignLedgerService>(CampaignLedgerService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSettlementHoldDays', () => {
    it('should return 7 when site settings has payoutSettlementHoldDays', async () => {
      (prisma.siteSettings.findUnique as jest.Mock).mockResolvedValue({
        payoutSettlementHoldDays: 7,
      });
      expect(await service.getSettlementHoldDays()).toBe(7);
    });

    it('should return default 7 when no site settings', async () => {
      (prisma.siteSettings.findUnique as jest.Mock).mockResolvedValue(null);
      expect(await service.getSettlementHoldDays()).toBe(7);
    });
  });

  describe('getEligibleBalance', () => {
    it('should return sum of ledger amounts where availableAt <= asOf', async () => {
      (
        prisma.campaignBalanceLedgerEntry.aggregate as jest.Mock
      ).mockResolvedValue({
        _sum: { amount: 1000 },
      });
      const balance = await service.getEligibleBalance('campaign-1');
      expect(balance).toBe(1000);
      expect(prisma.campaignBalanceLedgerEntry.aggregate).toHaveBeenCalledWith({
        where: { campaignId: 'campaign-1', availableAt: expect.any(Object) },
        _sum: { amount: true },
      });
    });

    it('should return 0 when no entries', async () => {
      (
        prisma.campaignBalanceLedgerEntry.aggregate as jest.Mock
      ).mockResolvedValue({
        _sum: { amount: null },
      });
      expect(await service.getEligibleBalance('campaign-1')).toBe(0);
    });
  });
});
