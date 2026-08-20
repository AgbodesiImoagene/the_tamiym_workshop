import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ModerationDecisionService } from './moderation-decision.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ModerationActorKind,
  ModerationAppealStatus,
  ModerationStatus,
  ModerationSubjectType,
} from '../generated/prisma/enums';
import {
  APPEAL_WINDOW_MS,
  MODERATION_POLICY_VERSION,
  MODERATION_REASON,
  customerExplanationForOutcome,
  hashRevision,
} from './moderation.constants';

describe('ModerationDecisionService', () => {
  let service: ModerationDecisionService;
  const prisma: Record<string, unknown> = {};

  beforeEach(async () => {
    prisma.$transaction = jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    );
    prisma.moderationDecision = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    };
    prisma.moderationAppeal = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    prisma.design = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    prisma.mediaAsset = { update: jest.fn() };
    prisma.campaign = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    prisma.designAsset = { findFirst: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModerationDecisionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ModerationDecisionService);
  });

  it('hashes revisions stably', () => {
    expect(hashRevision({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRevision({ a: 1 })).toBe(hashRevision({ a: 1 }));
  });

  it('customer explanations never echo internal notes', () => {
    const copy = customerExplanationForOutcome(ModerationStatus.REJECTED);
    expect(copy.toLowerCase()).not.toContain('score');
    expect(copy.toLowerCase()).not.toContain('harassment');
  });

  it('recordDecision inserts immutable row and updates design projection', async () => {
    (
      prisma.moderationAppeal as { findMany: jest.Mock }
    ).findMany.mockResolvedValue([]);
    (
      prisma.moderationDecision as { create: jest.Mock }
    ).create.mockResolvedValue({
      id: 'dec-1',
      outcome: ModerationStatus.REJECTED,
    });
    (prisma.design as { update: jest.Mock }).update.mockResolvedValue({});

    await service.recordDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: 'design-1',
      outcome: ModerationStatus.REJECTED,
      actorKind: ModerationActorKind.AI,
      reasonCodes: [MODERATION_REASON.AI_REJECT],
      internalEvidence: {
        notes: 'Categories above threshold: hate: 0.9',
        maxScore: 0.9,
      },
      withdrawPendingAppeals: true,
    });

    expect(
      (prisma.moderationDecision as { create: jest.Mock }).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subjectType: ModerationSubjectType.DESIGN,
          subjectId: 'design-1',
          outcome: ModerationStatus.REJECTED,
          policyVersion: MODERATION_POLICY_VERSION,
          customerExplanation: expect.not.stringMatching(/hate|0\.9/i),
        }),
      }),
    );
    expect(
      (prisma.design as { update: jest.Mock }).update,
    ).toHaveBeenCalledWith({
      where: { id: 'design-1' },
      data: expect.objectContaining({
        moderationStatus: ModerationStatus.REJECTED,
        moderationNotes: 'Categories above threshold: hate: 0.9',
      }),
    });
  });

  it('createAppeal rejects non-appealable outcomes and expired window', async () => {
    (
      prisma.moderationDecision as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'dec-1',
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: 'design-1',
      outcome: ModerationStatus.APPROVED,
      createdAt: new Date(),
    });
    (prisma.design as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      userId: 'user-1',
    });
    (
      prisma.moderationDecision as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: 'dec-1',
    });

    await expect(
      service.createAppeal('user-1', 'dec-1', 'please reconsider'),
    ).rejects.toBeInstanceOf(BadRequestException);

    (
      prisma.moderationDecision as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'dec-1',
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: 'design-1',
      outcome: ModerationStatus.REJECTED,
      createdAt: new Date(Date.now() - APPEAL_WINDOW_MS - 1000),
    });
    await expect(
      service.createAppeal('user-1', 'dec-1', 'please reconsider'),
    ).rejects.toThrow(/window/i);
  });

  it('createAppeal enforces one active appeal', async () => {
    (
      prisma.moderationDecision as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'dec-1',
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: 'design-1',
      outcome: ModerationStatus.FLAGGED,
      createdAt: new Date(),
    });
    (prisma.design as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      userId: 'user-1',
    });
    (
      prisma.moderationDecision as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: 'dec-1',
    });
    (
      prisma.moderationAppeal as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: 'appeal-1',
    });

    await expect(
      service.createAppeal('user-1', 'dec-1', 'please reconsider'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('withdrawAppeal only works for owner PENDING appeals', async () => {
    (
      prisma.moderationAppeal as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'appeal-1',
      ownerUserId: 'user-1',
      status: ModerationAppealStatus.PENDING,
    });
    (prisma.moderationAppeal as { update: jest.Mock }).update.mockResolvedValue(
      {
        id: 'appeal-1',
        status: ModerationAppealStatus.WITHDRAWN,
        decision: {
          id: 'dec-1',
          subjectType: ModerationSubjectType.DESIGN,
          subjectId: 'design-1',
          outcome: ModerationStatus.REJECTED,
          reasonCodes: [],
          customerExplanation: 'safe',
          createdAt: new Date(),
        },
      },
    );

    await service.withdrawAppeal('user-1', 'appeal-1');
    expect(
      (prisma.moderationAppeal as { update: jest.Mock }).update,
    ).toHaveBeenCalled();

    (
      prisma.moderationAppeal as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'appeal-1',
      ownerUserId: 'user-2',
      status: ModerationAppealStatus.PENDING,
    });
    await expect(
      service.withdrawAppeal('user-1', 'appeal-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolveAppeal enforces reviewer independence for ADMIN decisions', async () => {
    (
      prisma.moderationAppeal as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'appeal-1',
      status: ModerationAppealStatus.PENDING,
      decision: {
        id: 'dec-1',
        subjectType: ModerationSubjectType.DESIGN,
        subjectId: 'design-1',
        outcome: ModerationStatus.REJECTED,
        actorKind: ModerationActorKind.ADMIN,
        actorUserId: 'admin-1',
        revisionHash: null,
      },
    });

    await expect(
      service.resolveAppeal('admin-1', 'appeal-1', { resolution: 'UPHELD' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolveAppeal OVERTURNED appends APPROVED decision by default', async () => {
    (
      prisma.moderationAppeal as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'appeal-1',
      status: ModerationAppealStatus.PENDING,
      decision: {
        id: 'dec-1',
        subjectType: ModerationSubjectType.DESIGN,
        subjectId: 'design-1',
        outcome: ModerationStatus.REJECTED,
        actorKind: ModerationActorKind.AI,
        actorUserId: null,
        revisionHash: 'abc',
      },
    });
    (
      prisma.moderationAppeal as { findMany: jest.Mock }
    ).findMany.mockResolvedValue([]);
    (
      prisma.moderationDecision as { create: jest.Mock }
    ).create.mockResolvedValue({
      id: 'dec-2',
      outcome: ModerationStatus.APPROVED,
    });
    (prisma.design as { update: jest.Mock }).update.mockResolvedValue({});
    (prisma.moderationAppeal as { update: jest.Mock }).update.mockResolvedValue(
      {
        id: 'appeal-1',
        status: ModerationAppealStatus.OVERTURNED,
        decision: {},
      },
    );

    const result = await service.resolveAppeal('admin-2', 'appeal-1', {
      resolution: 'OVERTURNED',
    });

    expect(
      (prisma.moderationDecision as { create: jest.Mock }).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: ModerationStatus.APPROVED,
          actorKind: ModerationActorKind.APPEAL_RESOLUTION,
          reasonCodes: [MODERATION_REASON.APPEAL_OVERTURNED],
          supersedesDecisionId: 'dec-1',
        }),
      }),
    );
    expect(result.resolutionDecision.id).toBe('dec-2');
  });

  it('getAppealForOwner never selects internalEvidence', async () => {
    (
      prisma.moderationAppeal as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'appeal-1',
      ownerUserId: 'user-1',
      decision: {
        id: 'dec-1',
        subjectType: ModerationSubjectType.DESIGN,
        subjectId: 'design-1',
        outcome: ModerationStatus.REJECTED,
        reasonCodes: [MODERATION_REASON.AI_REJECT],
        customerExplanation: 'safe',
        policyVersion: MODERATION_POLICY_VERSION,
        createdAt: new Date(),
      },
    });

    const view = await service.getAppealForOwner('user-1', 'appeal-1');
    expect(view.decision).not.toHaveProperty('internalEvidence');
    expect(
      (prisma.moderationAppeal as { findUnique: jest.Mock }).findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          decision: expect.objectContaining({
            select: expect.not.objectContaining({
              internalEvidence: true,
            }),
          }),
        }),
      }),
    );
  });
});
