import { CampaignReadinessService } from './campaign-readiness.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import {
  CampaignReadinessCode,
  CampaignReadinessPhase,
  CAMPAIGN_READINESS_POLICY_VERSION,
} from './campaign-readiness.constants';
import {
  ModerationStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from '../organizer/organizer.constants';

describe('CampaignReadinessService', () => {
  let service: CampaignReadinessService;
  let prisma: {
    campaign: { findUnique: jest.Mock };
  };
  let pricing: { getMinCampaignProductPrice: jest.Mock };

  const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  function baseCampaign(overrides: Record<string, unknown> = {}) {
    return {
      id: 'camp-1',
      title: 'Library Drive',
      description: 'Books for students',
      story: 'We need more shelves.',
      currency: 'NGN',
      draftRevision: 2,
      approvedRevision: 2,
      startDate: null,
      endDate: futureEnd,
      organizer: {
        id: 'user-1',
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        organizerApplications: [{ termsVersion: ORGANIZER_TERMS_VERSION }],
      },
      products: [
        {
          id: 'cp-1',
          productId: 'prod-1',
          designId: 'design-1',
          product: {
            id: 'prod-1',
            status: ProductStatus.ACTIVE,
            variants: [
              {
                id: 'var-1',
                isAvailable: true,
                inventory: {
                  trackInventory: true,
                  stockOnHand: 5,
                  reserved: 0,
                },
              },
            ],
          },
          design: {
            id: 'design-1',
            moderationStatus: ModerationStatus.APPROVED,
          },
          prices: [{ currency: 'NGN', amount: 10000 }],
        },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = { campaign: { findUnique: jest.fn() } };
    pricing = {
      getMinCampaignProductPrice: jest.fn().mockResolvedValue(1000),
    };
    service = new CampaignReadinessService(
      prisma as unknown as PrismaService,
      pricing as unknown as PricingService,
    );
  });

  it('marks submit ready for a complete draft with pending design', async () => {
    prisma.campaign.findUnique.mockResolvedValue(
      baseCampaign({
        products: [
          {
            ...baseCampaign().products[0],
            design: {
              id: 'design-1',
              moderationStatus: ModerationStatus.PENDING,
            },
          },
        ],
      }),
    );
    const result = await service.evaluate(
      'camp-1',
      CampaignReadinessPhase.SUBMIT,
    );
    expect(result.ready).toBe(true);
    expect(result.policyVersion).toBe(CAMPAIGN_READINESS_POLICY_VERSION);
    expect(result.blockers).toHaveLength(0);
    expect(
      result.warnings.some(
        (w) => w.code === CampaignReadinessCode.PAYOUT_DEFERRED,
      ),
    ).toBe(true);
  });

  it('blocks submit when title/story/offers missing', async () => {
    prisma.campaign.findUnique.mockResolvedValue(
      baseCampaign({
        title: '  ',
        story: '',
        products: [],
      }),
    );
    const result = await service.evaluate(
      'camp-1',
      CampaignReadinessPhase.SUBMIT,
    );
    expect(result.ready).toBe(false);
    const codes = result.blockers.map((b) => b.code);
    expect(codes).toContain(CampaignReadinessCode.TITLE_MISSING);
    expect(codes).toContain(CampaignReadinessCode.STORY_MISSING);
    expect(codes).toContain(CampaignReadinessCode.NO_OFFERS);
  });

  it('blocks activate when design pending, product inactive, or no variants', async () => {
    prisma.campaign.findUnique.mockResolvedValue(
      baseCampaign({
        products: [
          {
            id: 'cp-1',
            productId: 'prod-1',
            designId: 'design-1',
            product: {
              id: 'prod-1',
              status: ProductStatus.DRAFT,
              variants: [
                {
                  id: 'var-1',
                  isAvailable: false,
                  inventory: null,
                },
              ],
            },
            design: {
              id: 'design-1',
              moderationStatus: ModerationStatus.PENDING,
            },
            prices: [{ currency: 'NGN', amount: 10000 }],
          },
        ],
      }),
    );
    const result = await service.evaluate(
      'camp-1',
      CampaignReadinessPhase.ACTIVATE,
    );
    const codes = result.blockers.map((b) => b.code);
    expect(codes).toContain(CampaignReadinessCode.DESIGN_NOT_APPROVED);
    expect(codes).toContain(CampaignReadinessCode.PRODUCT_INACTIVE);
    expect(codes).toContain(CampaignReadinessCode.NO_AVAILABLE_VARIANT);
  });

  it('blocks activate when end date is missing or past', async () => {
    prisma.campaign.findUnique.mockResolvedValue(
      baseCampaign({ endDate: new Date(Date.now() - 1000) }),
    );
    const result = await service.evaluate(
      'camp-1',
      CampaignReadinessPhase.ACTIVATE,
    );
    expect(
      result.blockers.some(
        (b) => b.code === CampaignReadinessCode.END_DATE_INVALID,
      ),
    ).toBe(true);
  });

  it('blocks resume on revision mismatch', async () => {
    prisma.campaign.findUnique.mockResolvedValue(
      baseCampaign({ approvedRevision: 1, draftRevision: 3 }),
    );
    const result = await service.evaluate(
      'camp-1',
      CampaignReadinessPhase.RESUME,
    );
    expect(
      result.blockers.some(
        (b) => b.code === CampaignReadinessCode.REVISION_MISMATCH,
      ),
    ).toBe(true);
  });

  it('blocks when organiser terms are stale', async () => {
    prisma.campaign.findUnique.mockResolvedValue(
      baseCampaign({
        organizer: {
          id: 'user-1',
          role: UserRole.ORGANIZER,
          status: UserStatus.ACTIVE,
          organizerApplications: [{ termsVersion: 'stale-terms' }],
        },
      }),
    );
    const result = await service.evaluate(
      'camp-1',
      CampaignReadinessPhase.SUBMIT,
    );
    expect(
      result.blockers.some(
        (b) => b.code === CampaignReadinessCode.TERMS_NOT_CURRENT,
      ),
    ).toBe(true);
  });

  it('blocks offer below floor', async () => {
    pricing.getMinCampaignProductPrice.mockResolvedValue(20000);
    prisma.campaign.findUnique.mockResolvedValue(baseCampaign());
    const result = await service.evaluate(
      'camp-1',
      CampaignReadinessPhase.SUBMIT,
    );
    expect(
      result.blockers.some(
        (b) => b.code === CampaignReadinessCode.OFFER_PRICE_INVALID,
      ),
    ).toBe(true);
  });

  it('warns on scheduled future start without blocking activate', async () => {
    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    prisma.campaign.findUnique.mockResolvedValue(
      baseCampaign({ startDate: start }),
    );
    const result = await service.evaluate(
      'camp-1',
      CampaignReadinessPhase.ACTIVATE,
    );
    expect(result.ready).toBe(true);
    expect(
      result.warnings.some(
        (w) => w.code === CampaignReadinessCode.SCHEDULED_START,
      ),
    ).toBe(true);
  });
});
