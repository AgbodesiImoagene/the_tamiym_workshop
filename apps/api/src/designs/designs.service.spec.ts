import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DesignsService } from './designs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import { S3Service } from '../storage/s3.service';
import { CreateDesignDto } from './dto/create-design.dto';
import { UpdateDesignDto } from './dto/update-design.dto';
import { ModerationStatus } from '../generated/prisma/enums';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { hashDesignShareToken } from './design-share.crypto';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPROVED_RESULT = {
  status: ModerationStatus.APPROVED,
  notes: 'No categories above threshold',
  maxScore: 0.05,
};

const mockDesign = {
  id: 'design-1',
  userId: 'user-1',
  productId: 'prod-1',
  campaignId: null,
  name: 'My Design',
  designData: { version: 1, views: {} },
  thumbnailUrl: null,
  moderationStatus: ModerationStatus.APPROVED,
  moderationNotes: APPROVED_RESULT.notes,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DesignsService', () => {
  let service: DesignsService;
  let prisma: jest.Mocked<PrismaService>;
  let moderationService: jest.Mocked<ModerationService>;
  let moderationDecisions: {
    recordAiDecision: jest.Mock;
    recordAiDecisionInTx: jest.Mock;
    recordAdminDecision: jest.Mock;
    recordDecisionInTx: jest.Mock;
  };
  let s3: jest.Mocked<S3Service>;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    const mockPrisma: Record<string, unknown> = {};
    mockPrisma.$transaction = jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.design = {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockPrisma.designShareLink = {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    mockPrisma.designView = {
      upsert: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    mockPrisma.product = {
      findUnique: jest.fn(),
    };
    mockPrisma.productView = {
      findMany: jest.fn().mockResolvedValue([]),
    };

    const mockModeration = {
      moderate: jest.fn().mockResolvedValue(APPROVED_RESULT),
      moderateText: jest.fn().mockResolvedValue(APPROVED_RESULT),
      moderateImage: jest.fn().mockResolvedValue(APPROVED_RESULT),
    };

    moderationDecisions = {
      recordAiDecision: jest.fn().mockResolvedValue({ id: 'dec-1' }),
      recordAiDecisionInTx: jest.fn().mockResolvedValue({ id: 'dec-1' }),
      recordAdminDecision: jest.fn().mockResolvedValue({ id: 'dec-1' }),
      recordDecisionInTx: jest.fn().mockResolvedValue({ id: 'dec-1' }),
    };

    const mockS3 = {
      uploadObject: jest.fn().mockResolvedValue({
        key: 'thumbnails/design-1/thumb.png',
        url: 'https://cdn.example.com/thumbnails/design-1/thumb.png',
      }),
    };

    config = {
      get: jest.fn((key: string) => {
        if (key === 'S3_PUBLIC_URL') return 'https://cdn.example.com';
        if (key === 'S3_BUCKET') return 'test-bucket';
        if (key === 'DESIGN_SHARE_PUBLIC_ORIGIN')
          return 'https://app.example.com';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DesignsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ModerationService, useValue: mockModeration },
        {
          provide: ModerationDecisionService,
          useValue: moderationDecisions,
        },
        { provide: S3Service, useValue: mockS3 },
        {
          provide: AdminNotifyService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: config,
        },
      ],
    }).compile();

    service = module.get<DesignsService>(DesignsService);
    prisma = module.get(PrismaService);
    moderationService = module.get(ModerationService);
    s3 = module.get(S3Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('creates a design, runs AI moderation when thumbnail provided, stores result', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        status: 'ACTIVE',
      });
      (prisma.design.create as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDesign,
      );
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        productId: 'prod-1',
      });

      const dto: CreateDesignDto = {
        name: 'My Design',
        productId: 'prod-1',
        designData: { version: 1, views: {} },
        thumbnailUrl: 'https://cdn.example.com/thumb.png',
      };
      const result = await service.create('user-1', dto);

      expect(moderationService.moderate).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'https://cdn.example.com/thumb.png',
        }),
      );
      expect(prisma.design.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          productId: 'prod-1',
          name: 'My Design',
          moderationStatus: ModerationStatus.APPROVED,
        }),
        include: expect.any(Object),
      });
      expect(moderationDecisions.recordAiDecisionInTx).toHaveBeenCalled();
      expect(result).not.toHaveProperty('moderationNotes');
      expect(result.moderationStatus).toBe(ModerationStatus.APPROVED);
    });

    it('falls back to PENDING when no text layers and no thumbnail', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        status: 'ACTIVE',
      });
      (prisma.design.create as jest.Mock).mockResolvedValue({
        ...mockDesign,
        moderationStatus: ModerationStatus.PENDING,
      });
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...mockDesign,
        moderationStatus: ModerationStatus.PENDING,
      });
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        productId: 'prod-1',
      });

      await service.create('user-1', {
        name: 'My Design',
        productId: 'prod-1',
        designData: { version: 1, views: {} },
      });

      expect(moderationService.moderate).not.toHaveBeenCalled();
      expect(prisma.design.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            moderationStatus: ModerationStatus.PENDING,
          }),
        }),
      );
      expect(moderationDecisions.recordAiDecisionInTx).toHaveBeenCalled();
    });

    it('rejects if product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create('user-1', {
          name: 'X',
          productId: 'missing',
          designData: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if designData is not an object', async () => {
      await expect(
        service.create('user-1', {
          name: 'X',
          productId: 'prod-1',
          designData: 'not-an-object' as unknown as Record<string, unknown>,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores text extracted from design layers for moderation', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        status: 'ACTIVE',
      });
      (prisma.design.create as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDesign,
      );
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        productId: 'prod-1',
      });
      (prisma.productView.findMany as jest.Mock).mockResolvedValue([
        { id: 'pv-1' },
      ]);

      const designData = {
        version: 1,
        views: {
          front: {
            productViewId: 'pv-1',
            layers: [
              { type: 'text', content: 'Hello World' },
              { type: 'image', designAssetId: 'da-1' },
            ],
          },
        },
      };

      await service.create('user-1', {
        name: 'D',
        productId: 'prod-1',
        designData,
      });

      expect(moderationService.moderate).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Hello World' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns designs for a user without moderationNotes', async () => {
      (prisma.design.findMany as jest.Mock).mockResolvedValue([mockDesign]);
      const result = await service.findAll('user-1');
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('moderationNotes');
      expect(result[0].moderationStatus).toBe(ModerationStatus.APPROVED);
    });
  });

  // -------------------------------------------------------------------------
  // findOne
  // -------------------------------------------------------------------------

  describe('findOne', () => {
    it('returns a design owned by the user without moderationNotes', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      const result = await service.findOne('user-1', 'design-1');
      expect(result).not.toHaveProperty('moderationNotes');
      expect(result.id).toBe('design-1');
    });

    it('throws NotFoundException when design does not exist', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('user-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user does not own the design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        userId: 'other-user',
      });
      await expect(service.findOne('user-1', 'design-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('updates name without re-running moderation', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.update as jest.Mock).mockResolvedValue({
        ...mockDesign,
        name: 'New Name',
      });

      const dto: UpdateDesignDto = { name: 'New Name' };
      await service.update('user-1', 'design-1', dto);

      expect(moderationService.moderate).not.toHaveBeenCalled();
      expect(prisma.design.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'New Name' }),
        }),
      );
    });

    it('re-runs moderation when designData with text layers changes', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        productId: 'prod-1',
      });
      (prisma.design.update as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDesign,
      );
      (prisma.productView.findMany as jest.Mock).mockResolvedValue([
        { id: 'pv-1' },
      ]);

      const dto: UpdateDesignDto = {
        designData: {
          version: 2,
          views: {
            front: {
              productViewId: 'pv-1',
              layers: [{ type: 'text', content: 'Updated text' }],
            },
          },
        },
      };
      const result = await service.update('user-1', 'design-1', dto);

      expect(moderationService.moderate).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Updated text' }),
      );
      expect(moderationDecisions.recordAiDecisionInTx).toHaveBeenCalled();
      expect(result).not.toHaveProperty('moderationNotes');
    });

    it('throws ForbiddenException when user does not own the design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        userId: 'other-user',
      });
      await expect(
        service.update('user-1', 'design-1', { name: 'X' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  describe('remove', () => {
    it('deletes an owned design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.delete as jest.Mock).mockResolvedValue(mockDesign);
      await service.remove('user-1', 'design-1');
      expect(prisma.design.delete).toHaveBeenCalledWith({
        where: { id: 'design-1' },
      });
    });

    it('throws ForbiddenException when user does not own the design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        userId: 'other-user',
      });
      await expect(service.remove('user-1', 'design-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateModeration (admin)
  // -------------------------------------------------------------------------

  describe('updateModeration', () => {
    it('updates moderation status with optional notes', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...mockDesign,
        moderationStatus: ModerationStatus.REJECTED,
        moderationNotes: 'admin note',
        user: { id: 'user-1', email: 'a@example.com' },
        product: { id: 'prod-1', name: 'P', slug: 'p' },
      });

      await service.updateModeration(
        'design-1',
        ModerationStatus.REJECTED,
        'admin note',
        'admin-1',
      );

      expect(moderationDecisions.recordAdminDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectId: 'design-1',
          outcome: ModerationStatus.REJECTED,
          actorUserId: 'admin-1',
          notes: 'admin note',
        }),
      );
    });

    it('throws NotFoundException when design does not exist', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.updateModeration('missing', ModerationStatus.APPROVED),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid status', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      await expect(
        service.updateModeration('design-1', ModerationStatus.PENDING),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // upsertDesignViews
  // -------------------------------------------------------------------------

  describe('upsertDesignViews', () => {
    it('upserts a DesignView row for each view with a productViewId', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        productId: 'prod-1',
      });
      (prisma.productView.findMany as jest.Mock).mockResolvedValue([
        { id: 'pv-1' },
        { id: 'pv-2' },
      ]);

      const designData = {
        version: 1,
        views: {
          front: {
            productViewId: 'pv-1',
            fabricJson: { objects: [{}, {}] },
            isUsed: true,
          },
          back: {
            productViewId: 'pv-2',
            fabricJson: { objects: [] },
            isUsed: false,
          },
        },
      };

      await service.upsertDesignViews('design-1', designData);

      expect(prisma.designView.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.designView.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            designId_productViewId: {
              designId: 'design-1',
              productViewId: 'pv-1',
            },
          },
          create: expect.objectContaining({ layerCount: 2, isUsed: true }),
        }),
      );
    });

    it('skips views without productViewId', async () => {
      await service.upsertDesignViews('design-1', {
        version: 1,
        views: { front: {} },
      });
      expect(prisma.designView.upsert).not.toHaveBeenCalled();
    });

    it('returns without error for empty views', async () => {
      await expect(
        service.upsertDesignViews('design-1', { version: 1 }),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // uploadThumbnail
  // -------------------------------------------------------------------------

  describe('uploadThumbnail', () => {
    it('uploads to S3 and updates thumbnailUrl', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.update as jest.Mock).mockResolvedValue({
        ...mockDesign,
        thumbnailUrl: 'https://cdn.example.com/thumbnails/design-1/thumb.png',
      });

      const result = await service.uploadThumbnail('user-1', 'design-1', {
        buffer: Buffer.from('fake'),
        mimetype: 'image/png',
      });

      expect(s3.uploadObject).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'thumbnails/design-1/thumb.png' }),
      );
      expect(result.thumbnailUrl).toContain('design-1');
    });

    it('throws BadRequestException for unsupported MIME type', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      await expect(
        service.uploadThumbnail('user-1', 'design-1', {
          buffer: Buffer.from('fake'),
          mimetype: 'image/gif',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when user does not own the design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        userId: 'other-user',
      });
      await expect(
        service.uploadThumbnail('user-1', 'design-1', {
          buffer: Buffer.from('fake'),
          mimetype: 'image/png',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // duplicate
  // -------------------------------------------------------------------------

  describe('duplicate', () => {
    it('clones the design with PENDING moderation and "Copy of" name', async () => {
      const original = {
        ...mockDesign,
        views: [
          {
            id: 'dv-1',
            designId: 'design-1',
            productViewId: 'pv-1',
            isUsed: true,
            layerCount: 2,
          },
        ],
      };
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(original);
      (prisma.design.create as jest.Mock).mockResolvedValue({
        ...mockDesign,
        id: 'design-2',
        name: 'Copy of My Design',
        moderationStatus: ModerationStatus.PENDING,
      });
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...mockDesign,
        id: 'design-2',
        name: 'Copy of My Design',
        moderationStatus: ModerationStatus.PENDING,
      });

      const result = await service.duplicate('user-1', 'design-1');

      expect(prisma.design.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Copy of My Design',
            moderationStatus: ModerationStatus.PENDING,
          }),
        }),
      );
      expect(moderationDecisions.recordDecisionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          outcome: ModerationStatus.PENDING,
          withdrawPendingAppeals: false,
        }),
      );
      expect(prisma.designView.createMany).toHaveBeenCalled();
      expect(result.id).toBe('design-2');
      expect(result).not.toHaveProperty('moderationNotes');
    });

    it('throws NotFoundException when original design does not exist', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.duplicate('user-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user does not own the design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        userId: 'other-user',
        views: [],
      });
      await expect(service.duplicate('user-1', 'design-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // createShareLink / findByShareToken
  // -------------------------------------------------------------------------

  describe('createShareLink', () => {
    it('creates a digested link and returns shareUrl from configured origin', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.designShareLink.create as jest.Mock).mockResolvedValue({
        id: 'link-1',
        expiresAt: new Date(Date.now() + 7 * 86400000),
        policyVersion: 'design-share-policy/v1-interim-2026-08-20',
      });
      (prisma.design.update as jest.Mock).mockResolvedValue(mockDesign);

      const result = await service.createShareLink('user-1', 'design-1', 7);

      expect(result.shareToken.length).toBeGreaterThan(20);
      expect(result.shareUrl).toContain(
        'https://app.example.com/design/shared/',
      );
      expect(prisma.designShareLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: hashDesignShareToken(result.shareToken),
          }),
        }),
      );
    });

    it('lists share links without plaintext', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.designShareLink.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'link-1',
          policyVersion: 'design-share-policy/v1-interim-2026-08-20',
          expiresAt: new Date(),
          revokedAt: null,
          lastAccessedAt: null,
          createdAt: new Date(),
        },
      ]);
      const rows = await service.listShareLinks('user-1', 'design-1');
      expect(rows[0].id).toBe('link-1');
      expect(rows[0]).not.toHaveProperty('tokenHash');
    });

    it('idempotently revokes a share link', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.designShareLink.findFirst as jest.Mock).mockResolvedValue({
        id: 'link-1',
        revokedAt: null,
      });
      (prisma.designShareLink.update as jest.Mock).mockResolvedValue({
        id: 'link-1',
        revokedAt: new Date('2026-08-20T00:00:00Z'),
      });
      const result = await service.revokeShareLink(
        'user-1',
        'design-1',
        'link-1',
      );
      expect(result.revokedAt).toBeTruthy();
    });

    it('rejects invalid ttlDays', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      await expect(
        service.createShareLink('user-1', 'design-1', 14),
      ).rejects.toThrow(BadRequestException);
    });

    it('generateShareToken delegates to createShareLink', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.designShareLink.create as jest.Mock).mockResolvedValue({
        id: 'link-1',
        expiresAt: new Date(Date.now() + 7 * 86400000),
        policyVersion: 'design-share-policy/v1-interim-2026-08-20',
      });
      (prisma.design.update as jest.Mock).mockResolvedValue(mockDesign);
      const result = await service.generateShareToken('user-1', 'design-1');
      expect(result.shareUrl).toContain('/design/shared/');
    });

    it('returns existing revokedAt without updating again', async () => {
      const revokedAt = new Date('2026-01-01T00:00:00Z');
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.designShareLink.findFirst as jest.Mock).mockResolvedValue({
        id: 'link-1',
        revokedAt,
      });
      const result = await service.revokeShareLink(
        'user-1',
        'design-1',
        'link-1',
      );
      expect(result.revokedAt).toEqual(revokedAt);
      expect(prisma.designShareLink.update).not.toHaveBeenCalled();
    });

    it('rejects non-APPROVED designs', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        moderationStatus: ModerationStatus.PENDING,
      });
      await expect(
        service.createShareLink('user-1', 'design-1', 7),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException for wrong owner', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        userId: 'other',
      });
      await expect(
        service.createShareLink('user-1', 'design-1', 7),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findByShareToken', () => {
    it('returns allowlisted fields for a valid link', async () => {
      (prisma.designShareLink.findUnique as jest.Mock).mockResolvedValue({
        id: 'link-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        design: {
          ...mockDesign,
          product: { id: 'prod-1', name: 'Tee', slug: 'tee' },
          views: [],
        },
      });
      (prisma.designShareLink.update as jest.Mock).mockResolvedValue({});

      const result = await service.findByShareToken(
        'abcdefghijklmnopqrstuvwxyz0123456789',
      );
      expect(result.id).toBe('design-1');
      expect(result).not.toHaveProperty('shareToken');
      expect(result).not.toHaveProperty('moderationStatus');
    });

    it('throws NotFoundException for short tokens', async () => {
      await expect(service.findByShareToken('short')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.designShareLink.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for revoked links', async () => {
      (prisma.designShareLink.findUnique as jest.Mock).mockResolvedValue({
        id: 'link-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        design: {
          ...mockDesign,
          product: { id: 'prod-1', name: 'Tee', slug: 'tee' },
          views: [],
        },
      });
      await expect(
        service.findByShareToken('abcdefghijklmnopqrstuvwxyz0123456789'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for unknown token', async () => {
      (prisma.designShareLink.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.findByShareToken('abcdefghijklmnopqrstuvwxyz0123456789'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for expired token', async () => {
      (prisma.designShareLink.findUnique as jest.Mock).mockResolvedValue({
        id: 'link-1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        design: {
          ...mockDesign,
          product: { id: 'prod-1', name: 'Tee', slug: 'tee' },
          views: [],
        },
      });
      await expect(
        service.findByShareToken('abcdefghijklmnopqrstuvwxyz0123456789'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
