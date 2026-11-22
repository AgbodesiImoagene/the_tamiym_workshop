import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ModerationDecisionService } from './moderation-decision.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
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
  const dispatch = { dispatch: jest.fn() };

  beforeEach(async () => {
    prisma.$transaction = jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    );
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ id: 'appeal-1' }]);
    prisma.moderationDecision = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    };
    prisma.moderationAppeal = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    dispatch.dispatch = jest.fn().mockResolvedValue({ outboxId: 'ob-1' });
    prisma.design = {
      findUnique: jest.fn().mockResolvedValue({
        moderationStatus: ModerationStatus.PENDING,
        name: 'Team shirt',
        product: { name: 'T-shirt' },
        user: { id: 'owner-1', email: 'owner@example.com', firstName: 'Ada' },
      }),
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
        { provide: NotificationDispatchService, useValue: dispatch },
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

  it('customerExplanationForOutcome rejects score-like overrides', () => {
    const template = customerExplanationForOutcome(ModerationStatus.REJECTED);
    expect(
      customerExplanationForOutcome(
        ModerationStatus.REJECTED,
        'Categories above threshold: hate: 0.9',
      ),
    ).toBe(template);
    expect(
      customerExplanationForOutcome(
        ModerationStatus.REJECTED,
        'maxScore=0.95 harassment flagged',
      ),
    ).toBe(template);
    expect(
      customerExplanationForOutcome(
        ModerationStatus.REJECTED,
        'category: violence',
      ),
    ).toBe(template);
    expect(
      customerExplanationForOutcome(
        ModerationStatus.REJECTED,
        'Please revise the wording and resubmit.',
      ),
    ).toBe('Please revise the wording and resubmit.');
  });

  it('recordDecision withdraws PENDING appeals for the subject', async () => {
    (
      prisma.moderationAppeal as { findMany: jest.Mock }
    ).findMany.mockResolvedValue([{ id: 'appeal-pending' }]);
    (
      prisma.moderationAppeal as { updateMany: jest.Mock }
    ).updateMany.mockResolvedValue({ count: 1 });
    (
      prisma.moderationDecision as { create: jest.Mock }
    ).create.mockResolvedValue({
      id: 'dec-2',
      outcome: ModerationStatus.APPROVED,
    });
    (prisma.design as { update: jest.Mock }).update.mockResolvedValue({});

    await service.recordDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: 'design-1',
      outcome: ModerationStatus.APPROVED,
      actorKind: ModerationActorKind.AI,
      reasonCodes: [MODERATION_REASON.AI_APPROVE],
      withdrawPendingAppeals: true,
    });

    expect(
      (prisma.moderationAppeal as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ModerationAppealStatus.PENDING,
          decision: {
            subjectType: ModerationSubjectType.DESIGN,
            subjectId: 'design-1',
          },
        }),
      }),
    );
    expect(
      (prisma.moderationAppeal as { updateMany: jest.Mock }).updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['appeal-pending'] } },
        data: expect.objectContaining({
          status: ModerationAppealStatus.WITHDRAWN,
        }),
      }),
    );
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

  describe('design decision emails (TTW-109)', () => {
    function mockDecision(id: string, outcome: ModerationStatus) {
      (
        prisma.moderationAppeal as { findMany: jest.Mock }
      ).findMany.mockResolvedValue([]);
      (
        prisma.moderationDecision as { create: jest.Mock }
      ).create.mockResolvedValue({ id, outcome });
      (prisma.design as { update: jest.Mock }).update.mockResolvedValue({});
    }
    function setPreviousDecision(
      outcome: ModerationStatus,
      actorKind: ModerationActorKind,
    ) {
      (
        prisma.moderationDecision as { findFirst: jest.Mock }
      ).findFirst.mockResolvedValue({ outcome, actorKind });
    }
    const adminInput = (outcome: ModerationStatus) => ({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: 'design-1',
      outcome,
      actorUserId: 'admin-1',
      notes: 'INTERNAL: looks like a stolen logo',
    });

    it('queues exactly one DesignModerationApproved email when an admin approves', async () => {
      mockDecision('dec-1', ModerationStatus.APPROVED);
      await service.recordAdminDecision(adminInput(ModerationStatus.APPROVED));

      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          tx: prisma,
          eventName: 'DesignModerationApproved',
          recipient: 'owner@example.com',
          recipientUserId: 'owner-1',
          dedupeKey: 'DesignModerationApproved:dec-1',
          payload: {
            designId: 'design-1',
            designName: 'Team shirt',
            productName: 'T-shirt',
            firstName: 'Ada',
          },
        }),
      );
    });

    it('queues a DesignModerationRejected email and never includes the internal notes', async () => {
      mockDecision('dec-2', ModerationStatus.REJECTED);
      await service.recordAdminDecision(adminInput(ModerationStatus.REJECTED));

      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
      const arg = dispatch.dispatch.mock.calls[0][0] as {
        eventName: string;
        payload: unknown;
      };
      expect(arg.eventName).toBe('DesignModerationRejected');
      expect(JSON.stringify(arg)).not.toContain('stolen logo');
      expect(JSON.stringify(arg)).not.toContain('INTERNAL');
    });

    it('sends the email when an admin confirms what only the AI had decided', async () => {
      setPreviousDecision(ModerationStatus.REJECTED, ModerationActorKind.AI);
      mockDecision('dec-3b', ModerationStatus.REJECTED);
      await service.recordAdminDecision(adminInput(ModerationStatus.REJECTED));
      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when the admin repeats what a human already decided', async () => {
      setPreviousDecision(ModerationStatus.APPROVED, ModerationActorKind.ADMIN);
      mockDecision('dec-3', ModerationStatus.APPROVED);
      await service.recordAdminDecision(adminInput(ModerationStatus.APPROVED));
      expect(dispatch.dispatch).not.toHaveBeenCalled();
    });

    it('sends nothing for FLAGGED or PENDING outcomes', async () => {
      mockDecision('dec-4', ModerationStatus.FLAGGED);
      await service.recordAdminDecision(adminInput(ModerationStatus.FLAGGED));
      await service.recordAdminDecision(adminInput(ModerationStatus.PENDING));
      expect(dispatch.dispatch).not.toHaveBeenCalled();
    });

    it('sends nothing for automatic (AI) decisions', async () => {
      mockDecision('dec-5', ModerationStatus.REJECTED);
      await service.recordAiDecision({
        subjectType: ModerationSubjectType.DESIGN,
        subjectId: 'design-1',
        outcome: ModerationStatus.REJECTED,
        notes: 'score 0.9',
      });
      expect(dispatch.dispatch).not.toHaveBeenCalled();
    });

    it('sends nothing for media or campaign decisions', async () => {
      mockDecision('dec-6', ModerationStatus.APPROVED);
      (prisma.mediaAsset as { update: jest.Mock }).update.mockResolvedValue({});
      await service.recordAdminDecision({
        ...adminInput(ModerationStatus.APPROVED),
        subjectType: ModerationSubjectType.MEDIA,
        subjectId: 'media-1',
      });
      expect(dispatch.dispatch).not.toHaveBeenCalled();
    });

    it('emails the owner when an appeal is resolved, even if the status is unchanged', async () => {
      (
        prisma.moderationAppeal as { findUnique: jest.Mock }
      ).findUnique.mockResolvedValue({
        id: 'appeal-1',
        status: ModerationAppealStatus.PENDING,
        decision: {
          id: 'dec-0',
          subjectType: ModerationSubjectType.DESIGN,
          subjectId: 'design-1',
          outcome: ModerationStatus.REJECTED,
          actorKind: ModerationActorKind.ADMIN,
          actorUserId: 'admin-1',
          revisionHash: 'abc',
        },
      });
      mockDecision('dec-7', ModerationStatus.REJECTED);
      (
        prisma.moderationAppeal as { updateMany: jest.Mock }
      ).updateMany.mockResolvedValue({ count: 1 });
      (
        prisma.moderationAppeal as { findUniqueOrThrow: jest.Mock }
      ).findUniqueOrThrow.mockResolvedValue({ id: 'appeal-1', decision: {} });

      await service.resolveAppeal('admin-2', 'appeal-1', {
        resolution: 'UPHELD',
        notes: 'INTERNAL appeal note',
      });

      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'DesignModerationRejected',
          dedupeKey: 'DesignModerationRejected:dec-7',
        }),
      );
      expect(JSON.stringify(dispatch.dispatch.mock.calls)).not.toContain(
        'INTERNAL',
      );
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
    (
      prisma.moderationAppeal as { updateMany: jest.Mock }
    ).updateMany.mockResolvedValue({ count: 1 });
    (
      prisma.moderationAppeal as { findUniqueOrThrow: jest.Mock }
    ).findUniqueOrThrow.mockResolvedValue({
      id: 'appeal-1',
      status: ModerationAppealStatus.OVERTURNED,
      decision: {},
    });

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
    expect(
      (prisma.moderationAppeal as { updateMany: jest.Mock }).updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'appeal-1',
          status: ModerationAppealStatus.PENDING,
        },
        data: expect.objectContaining({
          status: ModerationAppealStatus.OVERTURNED,
        }),
      }),
    );
    expect(result.resolutionDecision.id).toBe('dec-2');
  });

  it('resolveAppeal UPHELD appends decision with challenged outcome', async () => {
    (
      prisma.moderationAppeal as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'appeal-1',
      status: ModerationAppealStatus.PENDING,
      decision: {
        id: 'dec-1',
        subjectType: ModerationSubjectType.DESIGN,
        subjectId: 'design-1',
        outcome: ModerationStatus.FLAGGED,
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
      outcome: ModerationStatus.FLAGGED,
    });
    (prisma.design as { update: jest.Mock }).update.mockResolvedValue({});
    (
      prisma.moderationAppeal as { updateMany: jest.Mock }
    ).updateMany.mockResolvedValue({ count: 1 });
    (
      prisma.moderationAppeal as { findUniqueOrThrow: jest.Mock }
    ).findUniqueOrThrow.mockResolvedValue({
      id: 'appeal-1',
      status: ModerationAppealStatus.UPHELD,
      decision: {},
    });

    const result = await service.resolveAppeal('admin-2', 'appeal-1', {
      resolution: 'UPHELD',
    });

    expect(
      (prisma.moderationDecision as { create: jest.Mock }).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: ModerationStatus.FLAGGED,
          reasonCodes: [MODERATION_REASON.APPEAL_UPHELD],
        }),
      }),
    );
    expect(result.appeal.status).toBe(ModerationAppealStatus.UPHELD);
  });

  it('resolveAppeal fails when appeal is no longer PENDING (concurrent resolve)', async () => {
    (
      prisma.moderationAppeal as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'appeal-1',
      status: ModerationAppealStatus.UPHELD,
      decision: {
        id: 'dec-1',
        subjectType: ModerationSubjectType.DESIGN,
        subjectId: 'design-1',
        outcome: ModerationStatus.REJECTED,
        actorKind: ModerationActorKind.AI,
        actorUserId: null,
        revisionHash: null,
      },
    });

    await expect(
      service.resolveAppeal('admin-2', 'appeal-1', { resolution: 'UPHELD' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolveAppeal throws ConflictException when conditional claim loses race', async () => {
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
        revisionHash: null,
      },
    });
    (
      prisma.moderationAppeal as { findMany: jest.Mock }
    ).findMany.mockResolvedValue([]);
    (
      prisma.moderationDecision as { create: jest.Mock }
    ).create.mockResolvedValue({
      id: 'dec-2',
      outcome: ModerationStatus.REJECTED,
    });
    (prisma.design as { update: jest.Mock }).update.mockResolvedValue({});
    (
      prisma.moderationAppeal as { updateMany: jest.Mock }
    ).updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.resolveAppeal('admin-2', 'appeal-1', { resolution: 'UPHELD' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recordAiDecision wraps InTx in a transaction', async () => {
    (
      prisma.moderationDecision as { create: jest.Mock }
    ).create.mockResolvedValue({
      id: 'dec-ai',
      outcome: ModerationStatus.FLAGGED,
    });
    (prisma.design as { update: jest.Mock }).update.mockResolvedValue({});

    await service.recordAiDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: 'design-1',
      outcome: ModerationStatus.FLAGGED,
      notes: 'borderline',
      maxScore: 0.5,
      withdrawPendingAppeals: false,
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(
      (prisma.moderationDecision as { create: jest.Mock }).create,
    ).toHaveBeenCalled();
  });

  it('recordAdminDecision wraps InTx in a transaction', async () => {
    (
      prisma.moderationDecision as { create: jest.Mock }
    ).create.mockResolvedValue({
      id: 'dec-admin',
      outcome: ModerationStatus.APPROVED,
    });
    (prisma.design as { update: jest.Mock }).update.mockResolvedValue({});

    await service.recordAdminDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: 'design-1',
      outcome: ModerationStatus.APPROVED,
      actorUserId: 'admin-1',
      notes: 'ok',
      withdrawPendingAppeals: false,
    });

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('listAppealsForAdmin and getAppealForAdmin include decision evidence', async () => {
    (
      prisma.moderationAppeal as { findMany: jest.Mock }
    ).findMany.mockResolvedValue([{ id: 'a1' }]);
    (
      prisma.moderationAppeal as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'a1',
      decision: { internalEvidence: { notes: 'x' } },
    });

    await expect(
      service.listAppealsForAdmin(ModerationAppealStatus.PENDING),
    ).resolves.toEqual([{ id: 'a1' }]);
    await expect(service.getAppealForAdmin('a1')).resolves.toEqual(
      expect.objectContaining({
        id: 'a1',
        decision: expect.objectContaining({
          internalEvidence: { notes: 'x' },
        }),
      }),
    );
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
