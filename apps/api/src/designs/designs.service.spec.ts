import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { DesignsService } from './designs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import { S3Service } from '../storage/s3.service';
import { CreateDesignDto } from './dto/create-design.dto';
import { UpdateDesignDto } from './dto/update-design.dto';
import { ModerationStatus, UserRole } from '../generated/prisma/enums';
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
  // The existing tests describe the AI-on behaviour: they run with the setting on (TTW-252).
  let aiScreening: string | undefined;

  beforeEach(async () => {
    aiScreening = 'true';
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
    mockPrisma.designAsset = {
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
      uploadObject: jest.fn(),
      uploadPrivateObject: jest
        .fn()
        .mockImplementation(({ key }: { key: string }) =>
          Promise.resolve({ key }),
        ),
      getPrivateObjectBuffer: jest.fn(),
      getPrivateObjectStream: jest.fn(),
    };

    config = {
      get: jest.fn((key: string) => {
        if (key === 'S3_PUBLIC_URL') return 'https://cdn.example.com';
        if (key === 'S3_BUCKET') return 'test-bucket';
        if (key === 'DESIGN_SHARE_PUBLIC_ORIGIN')
          return 'https://app.example.com';
        if (key === 'API_PUBLIC_URL') return 'https://api.example.com/v1';
        if (key === 'AI_SCREENING_ENABLED') return aiScreening;
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
    it('creates a design, moderates its text without any image link, and stores no thumbnail (TTW-237)', async () => {
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
        designData: {
          version: 1,
          views: {
            front: {
              productViewId: 'pv-1',
              layers: [{ type: 'text', content: 'Hello' }],
            },
          },
        },
      };
      const result = await service.create('user-1', dto);

      expect(moderationService.moderate).toHaveBeenCalledWith({
        text: 'Hello',
        imageUrl: undefined,
      });
      const createArgs = (prisma.design.create as jest.Mock).mock.calls[0][0];
      expect(createArgs.data).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          productId: 'prod-1',
          name: 'My Design',
          moderationStatus: ModerationStatus.APPROVED,
        }),
      );
      expect(createArgs.data).not.toHaveProperty('thumbnailUrl');
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

      // TTW-100: the image of this design must now be a READY asset of the owner.
      (prisma.designAsset.findMany as jest.Mock).mockResolvedValue([
        { id: 'da-1', mediaAsset: { status: 'READY' } },
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
    let png: Buffer;
    beforeAll(async () => {
      png = await sharp({
        create: { width: 4, height: 4, channels: 3, background: '#ff0000' },
      })
        .png()
        .toBuffer();
    });

    it('stores the picture in the PRIVATE bucket under a fixed key, re-encoded as WebP, and keeps only an API path (TTW-237)', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDesign,
      );

      const result = await service.uploadThumbnail('user-1', 'design-1', {
        buffer: png,
        mimetype: 'image/png',
      });

      expect(s3.uploadObject).not.toHaveBeenCalled();
      expect(s3.uploadPrivateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'design-thumbnails/design-1',
          contentType: 'image/webp',
        }),
      );
      const stored = (s3.uploadPrivateObject as jest.Mock).mock.calls[0][0]
        .buffer as Buffer;
      expect((await sharp(stored).metadata()).format).toBe('webp');
      expect(result).toEqual({ thumbnailUrl: '/designs/design-1/thumbnail' });
      expect(prisma.design.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'design-1' },
          data: { thumbnailUrl: '/designs/design-1/thumbnail' },
        }),
      );
    });

    it('moderates the new picture from its bytes (no link) and records the decision, so an old APPROVED cannot carry over', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        designData: {
          version: 1,
          views: {
            front: {
              productViewId: 'pv-1',
              layers: [{ type: 'text', content: 'Hello' }],
            },
          },
        },
      });
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDesign,
      );
      moderationService.moderate.mockResolvedValue({
        status: ModerationStatus.FLAGGED,
        notes: 'Categories above threshold: violence: 0.500',
        maxScore: 0.5,
      });

      await service.uploadThumbnail('user-1', 'design-1', {
        buffer: png,
        mimetype: 'image/png',
      });

      expect(moderationService.moderate).toHaveBeenCalledWith({
        text: 'Hello',
        imageUrl: expect.stringMatching(/^data:image\/webp;base64,/),
      });
      expect(moderationDecisions.recordAiDecisionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subjectId: 'design-1',
          outcome: ModerationStatus.FLAGGED,
          withdrawPendingAppeals: true,
        }),
      );
    });

    it.each([
      ['REJECTED', ModerationStatus.REJECTED],
      ['FLAGGED', ModerationStatus.FLAGGED],
      ['PENDING', ModerationStatus.PENDING],
    ])(
      'never lets the AI lift a %s design to APPROVED by a new picture',
      async (_n, status) => {
        (prisma.design.findUnique as jest.Mock).mockResolvedValue({
          ...mockDesign,
          moderationStatus: status,
        });
        moderationService.moderate.mockResolvedValue(APPROVED_RESULT);

        await service.uploadThumbnail('user-1', 'design-1', {
          buffer: png,
          mimetype: 'image/png',
        });

        expect(moderationDecisions.recordAiDecisionInTx).not.toHaveBeenCalled();
        // The picture itself is still stored and the path set.
        expect(prisma.design.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { thumbnailUrl: '/designs/design-1/thumbnail' },
          }),
        );
      },
    );

    it('records a stricter AI outcome on a PENDING design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        moderationStatus: ModerationStatus.PENDING,
      });
      moderationService.moderate.mockResolvedValue({
        status: ModerationStatus.REJECTED,
        notes: 'bad',
        maxScore: 0.9,
      });
      await service.uploadThumbnail('user-1', 'design-1', {
        buffer: png,
        mimetype: 'image/png',
      });
      expect(moderationDecisions.recordAiDecisionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ outcome: ModerationStatus.REJECTED }),
      );
    });

    it('sets no thumbnail path when the storage write fails, so nothing points to a missing picture (TTW-237)', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      (s3.uploadPrivateObject as jest.Mock).mockRejectedValueOnce(
        new Error('storage down'),
      );

      await expect(
        service.uploadThumbnail('user-1', 'design-1', {
          buffer: png,
          mimetype: 'image/png',
        }),
      ).rejects.toThrow('storage down');

      expect(prisma.design.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { thumbnailUrl: '/designs/design-1/thumbnail' },
        }),
      );
    });

    it('sets the thumbnail path only after the picture is stored (TTW-237)', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);

      await service.uploadThumbnail('user-1', 'design-1', {
        buffer: png,
        mimetype: 'image/png',
      });

      const updateCall = (
        prisma.design.update as jest.Mock
      ).mock.calls.findIndex(
        ([arg]) => arg?.data?.thumbnailUrl === '/designs/design-1/thumbnail',
      );
      expect(updateCall).toBeGreaterThanOrEqual(0);
      const updateOrder = (prisma.design.update as jest.Mock).mock
        .invocationCallOrder[updateCall];
      const uploadOrder = (s3.uploadPrivateObject as jest.Mock).mock
        .invocationCallOrder[0];
      expect(updateOrder).toBeGreaterThan(uploadOrder);
    });

    it('commits the status change before the new picture replaces the old object', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      moderationService.moderate.mockResolvedValue({
        status: ModerationStatus.FLAGGED,
        notes: 'x',
        maxScore: 0.5,
      });
      await service.uploadThumbnail('user-1', 'design-1', {
        buffer: png,
        mimetype: 'image/png',
      });
      const decisionOrder =
        moderationDecisions.recordAiDecisionInTx.mock.invocationCallOrder[0];
      const uploadOrder = (s3.uploadPrivateObject as jest.Mock).mock
        .invocationCallOrder[0];
      expect(decisionOrder).toBeLessThan(uploadOrder);
    });

    it('refuses bytes that are not an image even when the client claims image/png, and stores nothing', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      await expect(
        service.uploadThumbnail('user-1', 'design-1', {
          buffer: Buffer.from('<html>not an image</html>'),
          mimetype: 'image/png',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(s3.uploadPrivateObject).not.toHaveBeenCalled();
      expect(prisma.design.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for unsupported MIME type', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(mockDesign);
      await expect(
        service.uploadThumbnail('user-1', 'design-1', {
          buffer: png,
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
          buffer: png,
          mimetype: 'image/png',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(s3.uploadPrivateObject).not.toHaveBeenCalled();
    });
  });

  describe('openThumbnail (TTW-237)', () => {
    const withThumb = (status: ModerationStatus) => ({
      id: 'design-1',
      userId: 'user-1',
      moderationStatus: status,
      thumbnailUrl: '/designs/design-1/thumbnail',
    });
    const owner = { id: 'user-1', role: UserRole.CUSTOMER };
    const stranger = { id: 'user-2', role: UserRole.CUSTOMER };
    const admin = { id: 'admin-1', role: UserRole.ADMIN };

    beforeEach(() => {
      (s3.getPrivateObjectStream as jest.Mock).mockResolvedValue({
        stream: Readable.from([Buffer.from('webp-bytes')]),
        contentLength: 10,
      });
    });

    it.each([
      ['PENDING', ModerationStatus.PENDING],
      ['FLAGGED', ModerationStatus.FLAGGED],
      ['REJECTED', ModerationStatus.REJECTED],
      ['APPROVED', ModerationStatus.APPROVED],
    ])('lets the owner and an admin read a %s design', async (_n, status) => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(
        withThumb(status),
      );
      for (const actor of [owner, admin]) {
        (s3.getPrivateObjectStream as jest.Mock).mockResolvedValue({
          stream: Readable.from([Buffer.from('webp-bytes')]),
          contentLength: 10,
        });
        const res = await service.openThumbnail(actor, 'design-1');
        expect(res.contentType).toBe('image/webp');
        expect(res.contentLength).toBe(10);
      }
      expect(s3.getPrivateObjectStream).toHaveBeenCalledWith(
        'design-thumbnails/design-1',
      );
    });

    it.each([
      ['PENDING', ModerationStatus.PENDING],
      ['FLAGGED', ModerationStatus.FLAGGED],
      ['REJECTED', ModerationStatus.REJECTED],
    ])(
      'answers the same 404 to a visitor and to another customer for a %s design',
      async (_n, status) => {
        (prisma.design.findUnique as jest.Mock).mockResolvedValue(
          withThumb(status),
        );
        for (const actor of [null, stranger]) {
          await expect(
            service.openThumbnail(actor, 'design-1'),
          ).rejects.toThrow(new NotFoundException('Thumbnail not found'));
        }
        expect(s3.getPrivateObjectStream).not.toHaveBeenCalled();
      },
    );

    it('lets a visitor read an APPROVED design', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue(
        withThumb(ModerationStatus.APPROVED),
      );
      const res = await service.openThumbnail(null, 'design-1');
      expect(res.contentType).toBe('image/webp');
    });

    it('closes the thumbnail as soon as an approved design is rejected (rule checked on every read)', async () => {
      const find = prisma.design.findUnique as jest.Mock;
      find.mockResolvedValueOnce(withThumb(ModerationStatus.APPROVED));
      await expect(
        service.openThumbnail(null, 'design-1'),
      ).resolves.toBeDefined();
      find.mockResolvedValueOnce(withThumb(ModerationStatus.REJECTED));
      await expect(service.openThumbnail(null, 'design-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('answers 404 for an unknown design, a design with no thumbnail, and a storage failure', async () => {
      const find = prisma.design.findUnique as jest.Mock;
      find.mockResolvedValueOnce(null);
      await expect(service.openThumbnail(owner, 'nope')).rejects.toThrow(
        NotFoundException,
      );
      find.mockResolvedValueOnce({
        ...withThumb(ModerationStatus.APPROVED),
        thumbnailUrl: null,
      });
      await expect(service.openThumbnail(owner, 'design-1')).rejects.toThrow(
        NotFoundException,
      );
      find.mockResolvedValueOnce(withThumb(ModerationStatus.APPROVED));
      (s3.getPrivateObjectStream as jest.Mock).mockRejectedValue(
        new Error('missing'),
      );
      await expect(service.openThumbnail(owner, 'design-1')).rejects.toThrow(
        NotFoundException,
      );
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

    describe('thumbnail of the copy (TTW-237)', () => {
      const original = {
        ...mockDesign,
        thumbnailUrl: '/designs/design-1/thumbnail',
        views: [],
      };
      const copyRow = {
        ...mockDesign,
        id: 'design-2',
        name: 'Copy of My Design',
        thumbnailUrl: null,
        moderationStatus: ModerationStatus.PENDING,
      };
      beforeEach(() => {
        (prisma.design.create as jest.Mock).mockResolvedValue(copyRow);
        (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue(
          copyRow,
        );
        (prisma.design.update as jest.Mock).mockImplementation(
          ({ data }: { data: object }) =>
            Promise.resolve({ ...copyRow, ...data }),
        );
      });

      it('gives the copy its own object and its own path, never the original path', async () => {
        (prisma.design.findUnique as jest.Mock).mockResolvedValue(original);
        (s3.getPrivateObjectBuffer as jest.Mock).mockResolvedValue(
          Buffer.from('bytes'),
        );

        const result = await service.duplicate('user-1', 'design-1');

        expect(
          (prisma.design.create as jest.Mock).mock.calls[0][0].data,
        ).not.toHaveProperty('thumbnailUrl', original.thumbnailUrl);
        expect(s3.getPrivateObjectBuffer).toHaveBeenCalledWith(
          'design-thumbnails/design-1',
        );
        expect(s3.uploadPrivateObject).toHaveBeenCalledWith({
          key: 'design-thumbnails/design-2',
          buffer: Buffer.from('bytes'),
          contentType: 'image/webp',
        });
        expect(result.thumbnailUrl).toBe('/designs/design-2/thumbnail');
        expect(result.moderationStatus).toBe(ModerationStatus.PENDING);
      });

      it('copies nothing when the original has no thumbnail', async () => {
        (prisma.design.findUnique as jest.Mock).mockResolvedValue({
          ...original,
          thumbnailUrl: null,
        });
        const result = await service.duplicate('user-1', 'design-1');
        expect(s3.getPrivateObjectBuffer).not.toHaveBeenCalled();
        expect(s3.uploadPrivateObject).not.toHaveBeenCalled();
        expect(result.thumbnailUrl).toBeNull();
      });

      it('still duplicates, without a thumbnail, when the copy of the picture fails', async () => {
        (prisma.design.findUnique as jest.Mock).mockResolvedValue(original);
        (s3.getPrivateObjectBuffer as jest.Mock).mockRejectedValue(
          new Error('gone'),
        );
        const result = await service.duplicate('user-1', 'design-1');
        expect(result.id).toBe('design-2');
        expect(result.thumbnailUrl).toBeNull();
      });
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

    it('pins the public response contract: product.id is the only product id (TTW-236)', async () => {
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

      // The mock ignores `select`, so pin what the database is asked for: the shared
      // page reads `product.id`; owner id and a duplicate `productId` are never selected.
      const args = (prisma.designShareLink.findUnique as jest.Mock).mock
        .calls[0][0] as {
        select: {
          design: { select: Record<string, unknown> & { product: unknown } };
        };
      };
      const selected = args.select.design.select;
      expect(selected.product).toEqual({
        select: { id: true, name: true, slug: true },
      });
      expect(selected).not.toHaveProperty('productId');
      expect(selected).not.toHaveProperty('userId');
      expect(selected).not.toHaveProperty('shareToken');
      expect(result.product.id).toBe('prod-1');
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

  // -------------------------------------------------------------------------
  // design content validation (TTW-100)
  // -------------------------------------------------------------------------

  describe('design content validation (TTW-100)', () => {
    const API = 'https://api.example.com/v1';
    const imageLayer = (id: string, src?: string) => ({
      type: 'Image',
      src: src ?? `${API}/design-assets/${id}/file?variant=original`,
      data: { designAssetId: id, layerId: `layer-${id}` },
    });
    const withLayers = (objects: unknown[]) => ({
      version: 1,
      productId: 'prod-1',
      views: {
        front: {
          productViewId: 'pv-1',
          isUsed: true,
          layerCount: objects.length,
          fabricJson: { objects },
        },
      },
    });
    const createWith = (designData: Record<string, unknown>) =>
      service.create('user-1', { name: 'D', productId: 'prod-1', designData });
    const codeOf = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        return (error as BadRequestException).getResponse() as {
          code?: string;
          statusCode?: number;
        };
      }
      return undefined;
    };

    beforeEach(() => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        status: 'ACTIVE',
      });
      (prisma.design.create as jest.Mock).mockResolvedValue(mockDesign);
      (prisma.design.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        mockDesign,
      );
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        designData: { version: 1, views: {} },
      });
      (prisma.design.update as jest.Mock).mockResolvedValue(mockDesign);
    });

    it('creates a design whose images are READY assets of the owner, asking the database once', async () => {
      (prisma.designAsset.findMany as jest.Mock).mockResolvedValue([
        { id: 'da_1', mediaAsset: { status: 'READY' } },
        { id: 'da_2', mediaAsset: { status: 'READY' } },
      ]);

      await createWith(withLayers([imageLayer('da_1'), imageLayer('da_2')]));

      expect(prisma.designAsset.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.designAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['da_1', 'da_2'] }, ownerUserId: 'user-1' },
        }),
      );
      expect(prisma.design.create).toHaveBeenCalled();
    });

    it('does not query assets for a design without images', async () => {
      await createWith(withLayers([{ type: 'IText', text: 'Hi' }]));
      expect(prisma.designAsset.findMany).not.toHaveBeenCalled();
    });

    it('refuses an external image with a stable code, before moderation and before saving', async () => {
      const body = await codeOf(
        createWith(
          withLayers([imageLayer('da_1', 'https://evil.example.com/a.png')]),
        ),
      );

      expect(body).toMatchObject({
        statusCode: 400,
        code: 'DESIGN_IMAGE_EXTERNAL',
      });
      expect(moderationService.moderate).not.toHaveBeenCalled();
      expect(prisma.design.create).not.toHaveBeenCalled();
    });

    it("refuses another user's asset with the same answer as an unknown one", async () => {
      // The owner filter returns nothing for an asset that belongs to someone else.
      (prisma.designAsset.findMany as jest.Mock).mockResolvedValue([]);

      const foreign = await codeOf(
        createWith(withLayers([imageLayer('da_x')])),
      );

      expect(foreign).toMatchObject({
        statusCode: 400,
        code: 'DESIGN_ASSET_NOT_FOUND',
      });
      expect(prisma.design.create).not.toHaveBeenCalled();
    });

    it.each(['PENDING', 'PROCESSING', 'FAILED'])(
      'refuses an asset that is %s, not READY',
      async (status) => {
        (prisma.designAsset.findMany as jest.Mock).mockResolvedValue([
          { id: 'da_1', mediaAsset: { status } },
        ]);

        const body = await codeOf(createWith(withLayers([imageLayer('da_1')])));

        expect(body).toMatchObject({ code: 'DESIGN_ASSET_NOT_READY' });
        expect(prisma.design.create).not.toHaveBeenCalled();
      },
    );

    it.each(['FLAGGED', 'REJECTED'])(
      'refuses an image whose moderation is %s, even when it is READY',
      async (moderationStatus) => {
        (prisma.designAsset.findMany as jest.Mock).mockResolvedValue([
          { id: 'da_1', mediaAsset: { status: 'READY', moderationStatus } },
        ]);

        const body = await codeOf(createWith(withLayers([imageLayer('da_1')])));

        expect(body).toMatchObject({ code: 'DESIGN_ASSET_NOT_APPROVED' });
        expect(prisma.design.create).not.toHaveBeenCalled();
      },
    );

    it.each(['APPROVED', 'PENDING'])(
      'accepts a READY image whose moderation is %s (a moderation outage leaves PENDING)',
      async (moderationStatus) => {
        (prisma.designAsset.findMany as jest.Mock).mockResolvedValue([
          { id: 'da_1', mediaAsset: { status: 'READY', moderationStatus } },
        ]);

        await createWith(withLayers([imageLayer('da_1')]));

        expect(prisma.design.create).toHaveBeenCalled();
      },
    );

    it('has no local fallback in a named environment such as staging', async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'staging';
      try {
        config.get.mockImplementation(() => undefined);
        const body = await codeOf(
          createWith(
            withLayers([
              imageLayer(
                'da_1',
                'http://localhost:3001/v1/design-assets/da_1/file',
              ),
            ]),
          ),
        );
        expect(body).toMatchObject({ code: 'DESIGN_IMAGE_EXTERNAL' });
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('refuses an unknown object type', async () => {
      const body = await codeOf(
        createWith(withLayers([{ type: 'rect', left: 1 }])),
      );
      expect(body).toMatchObject({ code: 'DESIGN_OBJECT_TYPE_NOT_ALLOWED' });
    });

    it('gives the size limit a stable code too, and keeps the 2 MB limit', async () => {
      const body = await codeOf(
        createWith(
          withLayers([{ type: 'IText', text: 'a'.repeat(2_000_001) }]),
        ),
      );
      expect(body).toMatchObject({ code: 'DESIGN_TOO_LARGE' });
    });

    it('applies the same rules on update, with the design owner as the asset owner', async () => {
      (prisma.designAsset.findMany as jest.Mock).mockResolvedValue([]);

      const body = await codeOf(
        service.update('user-1', 'design-1', {
          designData: withLayers([imageLayer('da_x')]),
        }),
      );

      expect(body).toMatchObject({ code: 'DESIGN_ASSET_NOT_FOUND' });
      expect(prisma.designAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['da_x'] }, ownerUserId: 'user-1' },
        }),
      );
      expect(prisma.design.update).not.toHaveBeenCalled();
    });

    it('refuses an external image on update before moderation', async () => {
      const body = await codeOf(
        service.update('user-1', 'design-1', {
          designData: withLayers([
            imageLayer('da_1', 'https://evil.example.com/a.png'),
          ]),
        }),
      );

      expect(body).toMatchObject({ code: 'DESIGN_IMAGE_EXTERNAL' });
      expect(moderationService.moderate).not.toHaveBeenCalled();
      expect(prisma.design.update).not.toHaveBeenCalled();
    });

    it('outside production, falls back to the local API address the app uses by default', async () => {
      config.get.mockImplementation(() => undefined);
      (prisma.designAsset.findMany as jest.Mock).mockResolvedValue([
        { id: 'da_1', mediaAsset: { status: 'READY' } },
      ]);

      await createWith(
        withLayers([
          imageLayer(
            'da_1',
            'http://localhost:3001/v1/design-assets/da_1/file?variant=original',
          ),
        ]),
      );

      expect(prisma.design.create).toHaveBeenCalled();
    });

    it('does not re-validate saved content when only the name changes', async () => {
      await service.update('user-1', 'design-1', { name: 'Renamed' });
      expect(prisma.designAsset.findMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // AI screening turned off (TTW-252)
  // -------------------------------------------------------------------------

  describe('with AI screening turned off (TTW-252)', () => {
    const OFF_NOTES = 'AI screening is turned off';
    const textDesign = {
      version: 1,
      views: {
        front: {
          productViewId: 'pv-1',
          layers: [{ type: 'text', content: 'Hello' }],
        },
      },
    };
    let png: Buffer;

    beforeAll(async () => {
      png = await sharp({
        create: { width: 4, height: 4, channels: 3, background: '#ff0000' },
      })
        .png()
        .toBuffer();
    });

    beforeEach(() => {
      aiScreening = undefined;
    });

    it.each([
      ['unset', undefined],
      ['false', 'false'],
      ['a misspelt value', 'yes please'],
    ])('does not call the AI when the setting is %s', async (_n, value) => {
      aiScreening = value;
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

      await service.create('user-1', {
        name: 'D',
        productId: 'prod-1',
        designData: textDesign,
      });

      expect(moderationService.moderate).not.toHaveBeenCalled();
    });

    it('creates a design that waits for an admin, and records the PENDING decision', async () => {
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

      await service.create('user-1', {
        name: 'D',
        productId: 'prod-1',
        designData: textDesign,
      });

      const createArgs = (prisma.design.create as jest.Mock).mock.calls[0][0];
      expect(createArgs.data.moderationStatus).toBe(ModerationStatus.PENDING);
      expect(moderationDecisions.recordAiDecisionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          outcome: ModerationStatus.PENDING,
          notes: OFF_NOTES,
          maxScore: 0,
        }),
      );
    });

    it('does not call the AI when the content of a design changes, and records PENDING', async () => {
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

      await service.update('user-1', 'design-1', { designData: textDesign });

      expect(moderationService.moderate).not.toHaveBeenCalled();
      expect(moderationDecisions.recordAiDecisionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          outcome: ModerationStatus.PENDING,
          notes: OFF_NOTES,
        }),
      );
    });

    it('does not send the new picture to the AI, and an APPROVED design goes back to PENDING so no unscreened picture is public', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        moderationStatus: ModerationStatus.APPROVED,
        designData: textDesign,
      });

      await service.uploadThumbnail('user-1', 'design-1', {
        buffer: png,
        mimetype: 'image/png',
      });

      expect(moderationService.moderate).not.toHaveBeenCalled();
      expect(moderationDecisions.recordAiDecisionInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subjectId: 'design-1',
          outcome: ModerationStatus.PENDING,
          notes: OFF_NOTES,
        }),
      );
    });

    it('leaves a design that is already waiting or refused as it is when its picture changes', async () => {
      (prisma.design.findUnique as jest.Mock).mockResolvedValue({
        ...mockDesign,
        moderationStatus: ModerationStatus.REJECTED,
        designData: textDesign,
      });

      await service.uploadThumbnail('user-1', 'design-1', {
        buffer: png,
        mimetype: 'image/png',
      });

      expect(moderationService.moderate).not.toHaveBeenCalled();
      expect(moderationDecisions.recordAiDecisionInTx).not.toHaveBeenCalled();
    });

    it.each([['true'], ['1'], [' TRUE ']])(
      'calls the AI again when the setting is %j',
      async (value) => {
        aiScreening = value;
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

        await service.create('user-1', {
          name: 'D',
          productId: 'prod-1',
          designData: textDesign,
        });

        expect(moderationService.moderate).toHaveBeenCalledTimes(1);
      },
    );
  });
});
