import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { AuditService } from '../audit/audit.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import {
  CampaignStatus,
  ModerationStatus,
  PayoutMode,
} from '../generated/prisma/enums';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPROVED_RESULT = {
  status: ModerationStatus.APPROVED,
  notes: 'No categories above threshold',
  maxScore: 0.05,
};

const FLAGGED_RESULT = {
  status: ModerationStatus.FLAGGED,
  notes: 'Categories above threshold: harassment: 0.450',
  maxScore: 0.45,
};

const REJECTED_RESULT = {
  status: ModerationStatus.REJECTED,
  notes: 'Categories above threshold: violence: 0.900',
  maxScore: 0.9,
};

const mockCampaign = {
  id: 'camp-1',
  organizerId: 'user-1',
  title: 'School Fundraiser',
  slug: 'school-fundraiser',
  description: 'Raising funds for a new library',
  story: 'We need books.',
  status: CampaignStatus.DRAFT,
  moderationStatus: ModerationStatus.PENDING,
  moderationNotes: null,
  rejectionReason: null,
  currency: 'NGN',
  goalAmount: 500000,
  currentAmount: 0,
  draftRevision: 1,
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockReviewCampaign = { ...mockCampaign, status: CampaignStatus.REVIEW };

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: jest.Mocked<PrismaService>;
  let pricingService: jest.Mocked<PricingService>;
  let moderationService: jest.Mocked<ModerationService>;
  let auditService: jest.Mocked<AuditService>;
  let adminNotifyService: jest.Mocked<AdminNotifyService>;

  beforeEach(async () => {
    const mockPrisma: Record<string, unknown> = {};
    mockPrisma.$transaction = jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.campaign = {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    mockPrisma.product = { findUnique: jest.fn() };
    mockPrisma.design = { findUnique: jest.fn() };
    mockPrisma.campaignProduct = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockPrisma.campaignProductPrice = {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    };
    const mockPricingService = {
      getMinCampaignProductPrice: jest.fn().mockResolvedValue(0),
      buildPublicCampaignOffers: jest.fn().mockReturnValue([]),
      buildOwnerDraftPreviewOffers: jest.fn().mockReturnValue([]),
    };
    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    const mockModerationService = {
      moderate: jest.fn().mockResolvedValue(APPROVED_RESULT),
      moderateText: jest.fn().mockResolvedValue(APPROVED_RESULT),
      moderateImage: jest.fn().mockResolvedValue(APPROVED_RESULT),
    };
    const mockModerationDecisions = {
      recordAiDecision: jest.fn().mockResolvedValue({ id: 'dec-1' }),
      recordAiDecisionInTx: jest.fn().mockResolvedValue({ id: 'dec-1' }),
      recordAdminDecision: jest.fn().mockResolvedValue({ id: 'dec-1' }),
      recordAdminDecisionInTx: jest.fn().mockResolvedValue({ id: 'dec-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PricingService, useValue: mockPricingService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ModerationService, useValue: mockModerationService },
        {
          provide: ModerationDecisionService,
          useValue: mockModerationDecisions,
        },
        {
          provide: AdminNotifyService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
    prisma = module.get(PrismaService);
    pricingService = module.get(PricingService);
    moderationService = module.get(ModerationService);
    auditService = module.get(AuditService);
    adminNotifyService = module.get(AdminNotifyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll strips moderationNotes for organizers', async () => {
    (prisma.campaign.findMany as jest.Mock).mockResolvedValue([
      {
        ...mockCampaign,
        moderationNotes: 'Categories above threshold: hate: 0.9',
        products: [],
      },
    ]);
    const result = await service.findAll('user-1');
    expect(result[0]).not.toHaveProperty('moderationNotes');
    expect(result[0]).toEqual(
      expect.objectContaining({ id: 'camp-1', title: 'School Fundraiser' }),
    );
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('creates a campaign in DRAFT', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.campaign.create as jest.Mock).mockResolvedValue(mockCampaign);

      const dto: CreateCampaignDto = { title: 'School Fundraiser' };
      const result = await service.create('user-1', dto);

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizerId: 'user-1',
          title: 'School Fundraiser',
          slug: 'school-fundraiser',
          status: CampaignStatus.DRAFT,
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'camp-1',
          title: 'School Fundraiser',
        }),
      );
      expect(result).not.toHaveProperty('moderationNotes');
    });

    it('throws ConflictException when slug exists', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);
      await expect(
        service.create('user-1', { title: 'School Fundraiser' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // findOne
  // -------------------------------------------------------------------------

  describe('findOne', () => {
    it('returns campaign when organizer owns it without moderationNotes', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [],
      });
      const result = await service.findOne('user-1', 'camp-1');
      expect(result).not.toHaveProperty('moderationNotes');
      expect(result.id).toBe('camp-1');
      expect(result.draftRevision).toBe(1);
      expect(result.offers).toEqual([]);
    });

    it('throws NotFoundException when campaign not found', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('user-1', 'invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user does not own campaign', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);
      await expect(service.findOne('other-user', 'camp-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findAllForAdmin', () => {
    it('includes linked design moderation context for moderation queues', async () => {
      (prisma.campaign.findMany as jest.Mock).mockResolvedValue([
        mockReviewCampaign,
      ]);

      await service.findAllForAdmin(CampaignStatus.REVIEW);

      expect(prisma.campaign.findMany).toHaveBeenCalledWith({
        where: { status: CampaignStatus.REVIEW },
        orderBy: { createdAt: 'desc' },
        include: {
          organizer: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          products: {
            include: {
              product: { select: { id: true, name: true } },
              design: {
                select: {
                  id: true,
                  name: true,
                  moderationStatus: true,
                  moderationNotes: true,
                },
              },
            },
          },
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // getBySlug
  // -------------------------------------------------------------------------

  describe('getBySlug', () => {
    it('returns active campaign with performance snapshot and empty offers', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
        organizer: { firstName: 'Ada', lastName: 'Okeke' },
        products: [],
      });
      pricingService.buildPublicCampaignOffers = jest.fn().mockReturnValue([]);

      const result = await service.getBySlug('school-fundraiser');
      expect(result.performance).toBeDefined();
      expect(result.performance.currentAmount).toBe(0);
      expect(result.offerPolicyVersion).toBe(
        'public-campaign-offer/v1-interim-2026-08-21',
      );
      expect(result.products).toEqual([]);
      expect(result.organizer).toEqual({
        firstName: 'Ada',
        lastName: 'Okeke',
      });
      expect(JSON.stringify(result)).not.toMatch(/moderationNotes|sku/i);
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getBySlug('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when campaign has not started yet', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
        startDate: new Date(Date.now() + 60_000),
        organizer: {},
        products: [],
      });
      await expect(service.getBySlug('school-fundraiser')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ends an expired active campaign before returning the public payload', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
        endDate: new Date(Date.now() - 60_000),
        organizer: {},
        products: [],
      });
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ENDED,
      });

      await expect(service.getBySlug('school-fundraiser')).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CampaignStatus.ENDED }),
        }),
      );
      expect(auditService.log).toHaveBeenCalled();
      expect(adminNotifyService.emit).toHaveBeenCalled();
    });

    it('maps sellable offers through PricingService and omits disclosure-sensitive fields', async () => {
      const offer = {
        campaignProductId: 'cp-1',
        productId: 'prod-1',
        product: {
          id: 'prod-1',
          name: 'Tee',
          slug: 'tee',
          description: null,
        },
        design: { id: 'd-1', name: 'Crest', thumbnailUrl: null },
        baseAmountMinor: 500_000,
        currency: 'NGN',
        priceDisclosure: 'before discounts, shipping and VAT',
        options: [],
        variants: [
          {
            id: 'var-1',
            optionValueIds: [],
            optionValueCodes: [],
            available: true,
            unitAmountMinor: 500_000,
            currency: 'NGN',
          },
        ],
      };
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
        organizer: { firstName: 'Ada', lastName: null },
        products: [{ id: 'cp-1' }],
      });
      pricingService.buildPublicCampaignOffers = jest
        .fn()
        .mockReturnValue([offer]);

      const result = await service.getBySlug('school-fundraiser');
      expect(pricingService.buildPublicCampaignOffers).toHaveBeenCalled();
      expect(result.products).toEqual([offer]);
      expect(result).not.toHaveProperty('moderationNotes');
      expect(result).not.toHaveProperty('moderationStatus');
    });
  });

  // -------------------------------------------------------------------------
  // submitForReview
  // -------------------------------------------------------------------------

  describe('submitForReview', () => {
    const pricedOffer = {
      id: 'cp-1',
      designId: 'design-1',
      design: { id: 'design-1', moderationStatus: ModerationStatus.PENDING },
      prices: [{ currency: 'NGN', amount: 10000 }],
    };

    it('transitions DRAFT → REVIEW when AI pre-approves', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [pricedOffer],
      });
      (prisma.campaign.update as jest.Mock).mockResolvedValue(
        mockReviewCampaign,
      );
      (prisma.campaign.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockReviewCampaign,
      );
      (moderationService.moderateText as jest.Mock).mockResolvedValue(
        APPROVED_RESULT,
      );

      const result = await service.submitForReview('camp-1', 'user-1');

      expect(moderationService.moderateText).toHaveBeenCalled();
      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CampaignStatus.REVIEW }),
        }),
      );
      expect(result.status).toBe(CampaignStatus.REVIEW);
      expect(result).not.toHaveProperty('moderationNotes');
    });

    it('stays in REVIEW with FLAGGED moderation when AI flags content', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [pricedOffer],
      });
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockReviewCampaign,
        moderationStatus: ModerationStatus.FLAGGED,
      });
      (prisma.campaign.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...mockReviewCampaign,
        moderationStatus: ModerationStatus.FLAGGED,
      });
      (moderationService.moderateText as jest.Mock).mockResolvedValue(
        FLAGGED_RESULT,
      );

      await service.submitForReview('camp-1', 'user-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CampaignStatus.REVIEW },
        }),
      );
    });

    it('auto-rejects (back to DRAFT) when AI rejects content', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [pricedOffer],
      });
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        moderationStatus: ModerationStatus.REJECTED,
      });
      (prisma.campaign.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        moderationStatus: ModerationStatus.REJECTED,
      });
      (moderationService.moderateText as jest.Mock).mockResolvedValue(
        REJECTED_RESULT,
      );

      await service.submitForReview('camp-1', 'user-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CampaignStatus.DRAFT },
        }),
      );
    });

    it('throws BadRequestException when campaign is not in DRAFT', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
        products: [],
      });
      await expect(service.submitForReview('camp-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when organiser does not own the campaign', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [],
      });
      await expect(
        service.submitForReview('camp-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns interim blocker when no offers', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [],
      });
      await expect(service.submitForReview('camp-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // activateForAdmin
  // -------------------------------------------------------------------------

  describe('activateForAdmin', () => {
    it('activates a REVIEW campaign with all designs APPROVED', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockReviewCampaign,
        products: [
          {
            design: {
              id: 'd-1',
              name: 'Logo Tee',
              moderationStatus: ModerationStatus.APPROVED,
            },
          },
        ],
      });
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockReviewCampaign,
        status: CampaignStatus.ACTIVE,
      });
      (prisma.campaign.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...mockReviewCampaign,
        status: CampaignStatus.ACTIVE,
      });

      const result = await service.activateForAdmin('camp-1', 'admin-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CampaignStatus.ACTIVE },
        }),
      );
      expect(result.status).toBe(CampaignStatus.ACTIVE);
    });

    it('throws BadRequestException if a design is not APPROVED', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockReviewCampaign,
        products: [
          {
            design: {
              id: 'd-1',
              name: 'Logo Tee',
              moderationStatus: ModerationStatus.PENDING,
            },
          },
        ],
      });

      await expect(
        service.activateForAdmin('camp-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when campaign is not in REVIEW', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [],
      });
      await expect(
        service.activateForAdmin('camp-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // rejectForAdmin
  // -------------------------------------------------------------------------

  describe('rejectForAdmin', () => {
    it('rejects a REVIEW campaign back to DRAFT with a reason', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(
        mockReviewCampaign,
      );
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        moderationStatus: ModerationStatus.REJECTED,
        rejectionReason: 'Misleading content',
      });
      (prisma.campaign.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        moderationStatus: ModerationStatus.REJECTED,
        rejectionReason: 'Misleading content',
      });

      await service.rejectForAdmin(
        'camp-1',
        'Misleading content',
        undefined,
        'admin-1',
      );

      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CampaignStatus.DRAFT },
        }),
      );
    });

    it('throws BadRequestException when campaign is not in REVIEW', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);
      await expect(
        service.rejectForAdmin('camp-1', 'reason', undefined, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // addOffer — atomic DRAFT offer mutations
  // -------------------------------------------------------------------------

  describe('addOffer', () => {
    beforeEach(() => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [],
      });
      (prisma.campaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        name: 'T-Shirt',
      });
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        id: 'design-1',
        userId: 'user-1',
        productId: 'prod-1',
      });
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.campaignProduct.create as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        campaignId: 'camp-1',
        productId: 'prod-1',
        designId: 'design-1',
      });
      (prisma.campaignProductPrice.create as jest.Mock).mockResolvedValue({});
      (
        pricingService.getMinCampaignProductPrice as jest.Mock
      ).mockResolvedValue(5000);
    });

    it('throws BadRequestException when campaign is ACTIVE (locked)', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
      });
      await expect(
        service.addOffer('camp-1', 'user-1', {
          expectedRevision: 1,
          productId: 'prod-1',
          designId: 'design-1',
          price: 6000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when campaign is in REVIEW (locked)', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(
        mockReviewCampaign,
      );
      await expect(
        service.addOffer('camp-1', 'user-1', {
          expectedRevision: 1,
          productId: 'prod-1',
          designId: 'design-1',
          price: 6000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when design is not owned', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        id: 'design-1',
        userId: 'other-user',
        productId: 'prod-1',
      });
      await expect(
        service.addOffer('camp-1', 'user-1', {
          expectedRevision: 1,
          productId: 'prod-1',
          designId: 'design-1',
          price: 6000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when price is below floor', async () => {
      (
        pricingService.getMinCampaignProductPrice as jest.Mock
      ).mockResolvedValue(8000);
      await expect(
        service.addOffer('camp-1', 'user-1', {
          expectedRevision: 1,
          productId: 'prod-1',
          designId: 'design-1',
          price: 5000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException on stale revision', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        draftRevision: 2,
        products: [],
      });
      await expect(
        service.addOffer('camp-1', 'user-1', {
          expectedRevision: 1,
          productId: 'prod-1',
          designId: 'design-1',
          price: 6000,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates offer and increments revision when valid', async () => {
      await service.addOffer('camp-1', 'user-1', {
        expectedRevision: 1,
        productId: 'prod-1',
        designId: 'design-1',
        price: 6000,
      });

      expect(prisma.campaignProduct.create).toHaveBeenCalled();
      expect(prisma.campaignProductPrice.create).toHaveBeenCalledWith({
        data: { campaignProductId: 'cp-1', currency: 'NGN', amount: 6000 },
      });
      expect(prisma.campaign.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ draftRevision: 1 }),
          data: { draftRevision: { increment: 1 } },
        }),
      );
    });
  });

  describe('update (basics + revision)', () => {
    it('rejects non-DRAFT campaigns', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ACTIVE,
      });
      await expect(
        service.update('user-1', 'camp-1', {
          expectedRevision: 1,
          title: 'Nope',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects stale revision with ConflictException', async () => {
      (prisma.campaign.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockCampaign)
        .mockResolvedValueOnce({
          draftRevision: 3,
          status: CampaignStatus.DRAFT,
          organizerId: 'user-1',
        });
      (prisma.campaign.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(
        service.update('user-1', 'camp-1', {
          expectedRevision: 1,
          title: 'Updated',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('updates basics and bumps revision', async () => {
      (prisma.campaign.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockCampaign)
        .mockResolvedValueOnce({
          ...mockCampaign,
          products: [],
          draftRevision: 2,
        });
      (prisma.campaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const result = await service.update('user-1', 'camp-1', {
        expectedRevision: 1,
        title: 'Updated Title',
      });
      expect(prisma.campaign.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ draftRevision: 1 }),
          data: expect.objectContaining({
            title: 'Updated Title',
            draftRevision: { increment: 1 },
          }),
        }),
      );
      expect(result.draftRevision).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // updateStatusForAdmin
  // -------------------------------------------------------------------------

  describe('updateStatusForAdmin', () => {
    it('disables a campaign', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.DISABLED,
      });

      const result = await service.updateStatusForAdmin(
        'camp-1',
        CampaignStatus.DISABLED,
      );
      expect(result.status).toBe(CampaignStatus.DISABLED);
    });

    it('throws BadRequestException when trying to set ACTIVE via this method', async () => {
      await expect(
        service.updateStatusForAdmin('camp-1', CampaignStatus.ACTIVE),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // updatePayoutPolicyForAdmin
  // -------------------------------------------------------------------------

  describe('updatePayoutPolicyForAdmin', () => {
    it('throws BadRequestException when payoutModeOverride is undefined', async () => {
      await expect(
        service.updatePayoutPolicyForAdmin('camp-1', undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('clears override when null', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        payoutModeOverride: null,
      });

      const result = await service.updatePayoutPolicyForAdmin('camp-1', null);
      expect(result.payoutModeOverride).toBeNull();
    });

    it('sets override to AUTO_EXECUTE', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        payoutModeOverride: PayoutMode.AUTO_EXECUTE,
      });

      await service.updatePayoutPolicyForAdmin(
        'camp-1',
        PayoutMode.AUTO_EXECUTE,
      );

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { payoutModeOverride: PayoutMode.AUTO_EXECUTE },
      });
    });
  });

  describe('endExpiredCampaigns', () => {
    it('transitions expired ACTIVE campaigns to ENDED', async () => {
      (prisma.campaign.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'camp-1',
          title: 'School Fundraiser',
          status: CampaignStatus.ACTIVE,
        },
      ]);
      (prisma.campaign.update as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.ENDED,
      });

      const count = await service.endExpiredCampaigns(new Date());

      expect(count).toBe(1);
      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'camp-1' },
          data: { status: CampaignStatus.ENDED },
        }),
      );
      expect(auditService.log).toHaveBeenCalled();
      expect(adminNotifyService.emit).toHaveBeenCalled();
    });

    it('returns zero when there are no expired active campaigns', async () => {
      (prisma.campaign.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.endExpiredCampaigns(new Date())).resolves.toBe(0);
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });
  });

  describe('getOwnerDraftPreview / getPriceGuidance / offer mutations', () => {
    it('getOwnerDraftPreview returns watermarked non-purchasable payload', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        ...mockCampaign,
        products: [],
      });
      pricingService.buildOwnerDraftPreviewOffers = jest
        .fn()
        .mockReturnValue([]);
      const result = await service.getOwnerDraftPreview('user-1', 'camp-1');
      expect(result.purchasable).toBe(false);
      expect(result.previewWatermark).toBe('DRAFT');
      expect(pricingService.buildOwnerDraftPreviewOffers).toHaveBeenCalled();
    });

    it('getPriceGuidance returns floor without cost fields', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        id: 'camp-1',
        organizerId: 'user-1',
        currency: 'NGN',
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        id: 'design-1',
        userId: 'user-1',
        productId: 'prod-1',
      });
      (
        pricingService.getMinCampaignProductPrice as jest.Mock
      ).mockResolvedValue(4200);
      const result = await service.getPriceGuidance(
        'user-1',
        'camp-1',
        'prod-1',
        'design-1',
      );
      expect(result.minimumPrice).toBe(4200);
      expect(JSON.stringify(result)).not.toMatch(/cost|basis/i);
    });

    it('updateOffer updates design/price and bumps revision', async () => {
      (prisma.campaign.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockCampaign)
        .mockResolvedValueOnce({
          ...mockCampaign,
          products: [],
          draftRevision: 2,
        });
      (prisma.campaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.campaignProduct.findFirst as jest.Mock)
        .mockResolvedValueOnce({
          id: 'cp-1',
          productId: 'prod-1',
          designId: 'design-1',
          prices: [{ id: 'price-1', currency: 'NGN', amount: 6000 }],
        })
        .mockResolvedValueOnce(null);
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        id: 'design-2',
        userId: 'user-1',
        productId: 'prod-1',
      });
      (
        pricingService.getMinCampaignProductPrice as jest.Mock
      ).mockResolvedValue(5000);
      (prisma.campaignProduct.update as jest.Mock).mockResolvedValue({});
      (prisma.campaignProductPrice.update as jest.Mock).mockResolvedValue({});

      await service.updateOffer('camp-1', 'cp-1', 'user-1', {
        expectedRevision: 1,
        designId: 'design-2',
        price: 7000,
      });

      expect(prisma.campaignProduct.update).toHaveBeenCalled();
      expect(prisma.campaignProductPrice.update).toHaveBeenCalled();
      expect(prisma.campaign.updateMany).toHaveBeenCalled();
    });

    it('removeOffer deletes offer rows and bumps revision', async () => {
      (prisma.campaign.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockCampaign)
        .mockResolvedValueOnce({
          ...mockCampaign,
          products: [],
          draftRevision: 2,
        });
      (prisma.campaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        campaignId: 'camp-1',
      });
      (prisma.campaignProductPrice.deleteMany as jest.Mock).mockResolvedValue(
        {},
      );
      (prisma.campaignProduct.delete as jest.Mock).mockResolvedValue({});

      await service.removeOffer('camp-1', 'cp-1', 'user-1', {
        expectedRevision: 1,
      });

      expect(prisma.campaignProductPrice.deleteMany).toHaveBeenCalled();
      expect(prisma.campaignProduct.delete).toHaveBeenCalled();
    });

    it('removeOffer throws when offer missing', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(mockCampaign);
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.removeOffer('camp-1', 'missing', 'user-1', {
          expectedRevision: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
