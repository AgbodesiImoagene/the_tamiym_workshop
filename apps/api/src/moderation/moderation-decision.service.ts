import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  ModerationActorKind,
  ModerationAppealStatus,
  ModerationStatus,
  ModerationSubjectType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  APPEAL_STATEMENT_MAX_CHARS,
  APPEAL_WINDOW_MS,
  MODERATION_AI_MODEL_VERSION,
  MODERATION_POLICY_VERSION,
  MODERATION_REASON,
  adminReasonCodesForOutcome,
  aiReasonCodesForOutcome,
  customerExplanationForOutcome,
  type ModerationReasonCode,
} from './moderation.constants';

export type RecordDecisionInput = {
  subjectType: ModerationSubjectType;
  subjectId: string;
  outcome: ModerationStatus;
  actorKind: ModerationActorKind;
  actorUserId?: string | null;
  reasonCodes: ModerationReasonCode[] | string[];
  revisionHash?: string | null;
  policyVersion?: string;
  modelVersion?: string | null;
  customerExplanation?: string | null;
  internalEvidence?: Prisma.InputJsonValue | null;
  supersedesDecisionId?: string | null;
  /**
   * When true (default for content edits / new AI decisions), withdraw all
   * PENDING appeals for this subject before inserting the new decision.
   */
  withdrawPendingAppeals?: boolean;
};

export type ResolveAppealInput = {
  resolution: 'UPHELD' | 'OVERTURNED';
  status?: ModerationStatus;
  notes?: string;
  customerExplanation?: string;
};

type Tx = Prisma.TransactionClient;

@Injectable()
export class ModerationDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  async recordDecision(input: RecordDecisionInput) {
    return this.prisma.$transaction((tx) => this.recordDecisionInTx(tx, input));
  }

  async recordDecisionInTx(tx: Tx, input: RecordDecisionInput) {
    const policyVersion = input.policyVersion ?? MODERATION_POLICY_VERSION;
    const modelVersion =
      input.modelVersion !== undefined
        ? input.modelVersion
        : input.actorKind === ModerationActorKind.AI
          ? MODERATION_AI_MODEL_VERSION
          : null;

    const customerExplanation = customerExplanationForOutcome(
      input.outcome,
      input.customerExplanation,
    );

    if (input.withdrawPendingAppeals !== false) {
      await this.withdrawPendingAppealsForSubject(
        tx,
        input.subjectType,
        input.subjectId,
      );
    }

    const decision = await tx.moderationDecision.create({
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        revisionHash: input.revisionHash ?? null,
        outcome: input.outcome,
        actorKind: input.actorKind,
        actorUserId: input.actorUserId ?? null,
        policyVersion,
        modelVersion,
        reasonCodes: [...input.reasonCodes],
        customerExplanation,
        internalEvidence:
          input.internalEvidence === undefined
            ? undefined
            : input.internalEvidence === null
              ? Prisma.JsonNull
              : input.internalEvidence,
        supersedesDecisionId: input.supersedesDecisionId ?? null,
      },
    });

    await this.applyProjection(tx, input, customerExplanation);

    return decision;
  }

  /**
   * Record an AI screening outcome with standard reason codes and safe copy.
   */
  async recordAiDecision(
    input: Omit<
      RecordDecisionInput,
      'actorKind' | 'reasonCodes' | 'modelVersion'
    > & {
      notes?: string | null;
      maxScore?: number | null;
      reasonCodes?: ModerationReasonCode[] | string[];
    },
  ) {
    return this.prisma.$transaction((tx) =>
      this.recordAiDecisionInTx(tx, input),
    );
  }

  async recordAiDecisionInTx(
    tx: Tx,
    input: Omit<
      RecordDecisionInput,
      'actorKind' | 'reasonCodes' | 'modelVersion'
    > & {
      notes?: string | null;
      maxScore?: number | null;
      reasonCodes?: ModerationReasonCode[] | string[];
    },
  ) {
    const reasonCodes =
      input.reasonCodes ??
      aiReasonCodesForOutcome(input.outcome, input.notes ?? null);
    const internalEvidence: Prisma.InputJsonValue = {
      notes: input.notes ?? null,
      ...(input.maxScore !== undefined && input.maxScore !== null
        ? { maxScore: input.maxScore }
        : {}),
    };
    return this.recordDecisionInTx(tx, {
      ...input,
      actorKind: ModerationActorKind.AI,
      reasonCodes,
      modelVersion: MODERATION_AI_MODEL_VERSION,
      internalEvidence,
      customerExplanation:
        input.customerExplanation ??
        customerExplanationForOutcome(input.outcome),
    });
  }

  async recordAdminDecision(
    input: Omit<
      RecordDecisionInput,
      'actorKind' | 'reasonCodes' | 'modelVersion'
    > & {
      notes?: string | null;
      reasonCodes?: ModerationReasonCode[] | string[];
    },
  ) {
    return this.prisma.$transaction((tx) =>
      this.recordAdminDecisionInTx(tx, input),
    );
  }

  async recordAdminDecisionInTx(
    tx: Tx,
    input: Omit<
      RecordDecisionInput,
      'actorKind' | 'reasonCodes' | 'modelVersion'
    > & {
      notes?: string | null;
      reasonCodes?: ModerationReasonCode[] | string[];
    },
  ) {
    const reasonCodes =
      input.reasonCodes ?? adminReasonCodesForOutcome(input.outcome);
    const internalEvidence: Prisma.InputJsonValue = {
      notes: input.notes ?? null,
    };
    return this.recordDecisionInTx(tx, {
      ...input,
      actorKind: ModerationActorKind.ADMIN,
      reasonCodes,
      modelVersion: null,
      internalEvidence,
      withdrawPendingAppeals: input.withdrawPendingAppeals ?? true,
    });
  }

  async createAppeal(
    ownerUserId: string,
    decisionId: string,
    statement: string,
  ) {
    const trimmed = statement?.trim() ?? '';
    if (!trimmed) {
      throw new BadRequestException('statement is required');
    }
    if (trimmed.length > APPEAL_STATEMENT_MAX_CHARS) {
      throw new BadRequestException(
        `statement must be at most ${APPEAL_STATEMENT_MAX_CHARS} characters`,
      );
    }

    const decision = await this.prisma.moderationDecision.findUnique({
      where: { id: decisionId },
    });
    if (!decision) {
      throw new NotFoundException('Decision not found');
    }

    await this.assertOwner(
      ownerUserId,
      decision.subjectType,
      decision.subjectId,
    );

    const latest = await this.prisma.moderationDecision.findFirst({
      where: {
        subjectType: decision.subjectType,
        subjectId: decision.subjectId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest || latest.id !== decision.id) {
      throw new BadRequestException(
        'Only the latest decision for this content can be appealed',
      );
    }

    if (
      decision.outcome !== ModerationStatus.REJECTED &&
      decision.outcome !== ModerationStatus.FLAGGED
    ) {
      throw new BadRequestException(
        'Only REJECTED or FLAGGED decisions can be appealed',
      );
    }

    const ageMs = Date.now() - decision.createdAt.getTime();
    if (ageMs > APPEAL_WINDOW_MS) {
      throw new BadRequestException('Appeal window has expired');
    }

    const existingPending = await this.prisma.moderationAppeal.findFirst({
      where: { decisionId, status: ModerationAppealStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException(
        'An active appeal already exists for this decision',
      );
    }

    try {
      return await this.prisma.moderationAppeal.create({
        data: {
          decisionId,
          ownerUserId,
          statement: trimmed,
          policyVersion: MODERATION_POLICY_VERSION,
          status: ModerationAppealStatus.PENDING,
        },
        include: {
          decision: {
            select: {
              id: true,
              subjectType: true,
              subjectId: true,
              outcome: true,
              reasonCodes: true,
              customerExplanation: true,
              policyVersion: true,
              createdAt: true,
            },
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'An active appeal already exists for this decision',
        );
      }
      throw err;
    }
  }

  async withdrawAppeal(ownerUserId: string, appealId: string) {
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: appealId },
    });
    if (!appeal) {
      throw new NotFoundException('Appeal not found');
    }
    if (appeal.ownerUserId !== ownerUserId) {
      throw new ForbiddenException('Access denied');
    }
    if (appeal.status !== ModerationAppealStatus.PENDING) {
      throw new BadRequestException('Only PENDING appeals can be withdrawn');
    }

    return this.prisma.moderationAppeal.update({
      where: { id: appealId },
      data: {
        status: ModerationAppealStatus.WITHDRAWN,
        withdrawnAt: new Date(),
      },
      include: {
        decision: {
          select: {
            id: true,
            subjectType: true,
            subjectId: true,
            outcome: true,
            reasonCodes: true,
            customerExplanation: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async listAppealsForOwner(ownerUserId: string) {
    const appeals = await this.prisma.moderationAppeal.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        decision: {
          select: {
            id: true,
            subjectType: true,
            subjectId: true,
            outcome: true,
            reasonCodes: true,
            customerExplanation: true,
            policyVersion: true,
            createdAt: true,
          },
        },
      },
    });
    return appeals.map((a) => this.toOwnerAppealView(a));
  }

  async getAppealForOwner(ownerUserId: string, appealId: string) {
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: appealId },
      include: {
        decision: {
          select: {
            id: true,
            subjectType: true,
            subjectId: true,
            outcome: true,
            reasonCodes: true,
            customerExplanation: true,
            policyVersion: true,
            createdAt: true,
            // intentionally omit internalEvidence
          },
        },
      },
    });
    if (!appeal || appeal.ownerUserId !== ownerUserId) {
      throw new NotFoundException('Appeal not found');
    }
    return this.toOwnerAppealView(appeal);
  }

  async listAppealsForAdmin(status?: ModerationAppealStatus) {
    const where = status ? { status } : {};
    return this.prisma.moderationAppeal.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        decision: true,
      },
    });
  }

  async getAppealForAdmin(appealId: string) {
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: appealId },
      include: { decision: true },
    });
    if (!appeal) {
      throw new NotFoundException('Appeal not found');
    }
    return appeal;
  }

  async resolveAppeal(
    adminUserId: string,
    appealId: string,
    input: ResolveAppealInput,
  ) {
    if (input.resolution !== 'UPHELD' && input.resolution !== 'OVERTURNED') {
      throw new BadRequestException('resolution must be UPHELD or OVERTURNED');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM moderation_appeals WHERE id = ${appealId} FOR UPDATE
      `;

      const appeal = await tx.moderationAppeal.findUnique({
        where: { id: appealId },
        include: { decision: true },
      });
      if (!appeal) {
        throw new NotFoundException('Appeal not found');
      }
      if (appeal.status !== ModerationAppealStatus.PENDING) {
        throw new BadRequestException('Only PENDING appeals can be resolved');
      }

      const challenged = appeal.decision;
      if (
        challenged.actorKind === ModerationActorKind.ADMIN &&
        challenged.actorUserId &&
        challenged.actorUserId === adminUserId
      ) {
        throw new ForbiddenException(
          'Reviewer independence: you cannot resolve an appeal of your own decision',
        );
      }

      let outcome: ModerationStatus;
      let reasonCodes: string[];
      if (input.resolution === 'UPHELD') {
        outcome = challenged.outcome;
        reasonCodes = [MODERATION_REASON.APPEAL_UPHELD];
      } else {
        outcome = input.status ?? ModerationStatus.APPROVED;
        if (
          outcome !== ModerationStatus.APPROVED &&
          outcome !== ModerationStatus.REJECTED &&
          outcome !== ModerationStatus.FLAGGED
        ) {
          throw new BadRequestException(
            'status must be APPROVED, REJECTED, or FLAGGED when overturning',
          );
        }
        reasonCodes = [MODERATION_REASON.APPEAL_OVERTURNED];
      }

      const customerExplanation = customerExplanationForOutcome(
        outcome,
        input.customerExplanation,
      );
      const internalEvidence: Prisma.InputJsonValue = {
        notes: input.notes ?? null,
        appealId: appeal.id,
        challengedDecisionId: challenged.id,
        resolution: input.resolution,
      };

      // Do not auto-withdraw this appeal via subject withdrawal — we resolve it.
      const resolutionDecision = await this.recordDecisionInTx(tx, {
        subjectType: challenged.subjectType,
        subjectId: challenged.subjectId,
        outcome,
        actorKind: ModerationActorKind.APPEAL_RESOLUTION,
        actorUserId: adminUserId,
        reasonCodes,
        revisionHash: challenged.revisionHash,
        customerExplanation,
        internalEvidence,
        supersedesDecisionId: challenged.id,
        withdrawPendingAppeals: false,
      });

      const appealStatus =
        input.resolution === 'UPHELD'
          ? ModerationAppealStatus.UPHELD
          : ModerationAppealStatus.OVERTURNED;

      const claim = await tx.moderationAppeal.updateMany({
        where: {
          id: appealId,
          status: ModerationAppealStatus.PENDING,
        },
        data: {
          status: appealStatus,
          resolutionDecisionId: resolutionDecision.id,
          reviewedByUserId: adminUserId,
          reviewedAt: new Date(),
        },
      });
      if (claim.count !== 1) {
        throw new ConflictException('Appeal already resolved');
      }

      const updated = await tx.moderationAppeal.findUniqueOrThrow({
        where: { id: appealId },
        include: { decision: true },
      });

      return { appeal: updated, resolutionDecision };
    });
  }

  /**
   * Privacy erasure: withdraw PENDING appeals owned by the user.
   */
  async withdrawPendingAppealsForOwnerInTx(tx: Tx, ownerUserId: string) {
    const result = await tx.moderationAppeal.updateMany({
      where: {
        ownerUserId,
        status: ModerationAppealStatus.PENDING,
      },
      data: {
        status: ModerationAppealStatus.WITHDRAWN,
        withdrawnAt: new Date(),
      },
    });
    return result.count;
  }

  private async withdrawPendingAppealsForSubject(
    tx: Tx,
    subjectType: ModerationSubjectType,
    subjectId: string,
  ) {
    const pending = await tx.moderationAppeal.findMany({
      where: {
        status: ModerationAppealStatus.PENDING,
        decision: { subjectType, subjectId },
      },
      select: { id: true },
    });
    if (pending.length === 0) return;
    await tx.moderationAppeal.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: {
        status: ModerationAppealStatus.WITHDRAWN,
        withdrawnAt: new Date(),
      },
    });
  }

  private async applyProjection(
    tx: Tx,
    input: RecordDecisionInput,
    customerExplanation: string,
  ) {
    const evidence =
      input.internalEvidence &&
      typeof input.internalEvidence === 'object' &&
      !Array.isArray(input.internalEvidence)
        ? (input.internalEvidence as Record<string, unknown>)
        : null;
    const notesUpdate =
      evidence && 'notes' in evidence
        ? {
            moderationNotes:
              evidence.notes == null
                ? null
                : typeof evidence.notes === 'string'
                  ? evidence.notes
                  : JSON.stringify(evidence.notes),
          }
        : {};

    if (input.subjectType === ModerationSubjectType.DESIGN) {
      await tx.design.update({
        where: { id: input.subjectId },
        data: {
          moderationStatus: input.outcome,
          ...notesUpdate,
        },
      });
      return;
    }

    if (input.subjectType === ModerationSubjectType.MEDIA) {
      await tx.mediaAsset.update({
        where: { id: input.subjectId },
        data: {
          moderationStatus: input.outcome,
          ...notesUpdate,
        },
      });
      return;
    }

    if (input.subjectType === ModerationSubjectType.CAMPAIGN) {
      await tx.campaign.update({
        where: { id: input.subjectId },
        data: {
          moderationStatus: input.outcome,
          ...notesUpdate,
          rejectionReason:
            input.outcome === ModerationStatus.REJECTED
              ? customerExplanation
              : null,
        },
      });
    }
  }

  private async assertOwner(
    ownerUserId: string,
    subjectType: ModerationSubjectType,
    subjectId: string,
  ) {
    if (subjectType === ModerationSubjectType.DESIGN) {
      const design = await this.prisma.design.findUnique({
        where: { id: subjectId },
        select: { userId: true },
      });
      if (!design) throw new NotFoundException('Design not found');
      if (design.userId !== ownerUserId) {
        throw new ForbiddenException('Access denied');
      }
      return;
    }

    if (subjectType === ModerationSubjectType.MEDIA) {
      const link = await this.prisma.designAsset.findFirst({
        where: { mediaAssetId: subjectId },
        select: { ownerUserId: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!link || link.ownerUserId !== ownerUserId) {
        throw new ForbiddenException('Access denied');
      }
      return;
    }

    if (subjectType === ModerationSubjectType.CAMPAIGN) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: subjectId },
        select: { organizerId: true },
      });
      if (!campaign) throw new NotFoundException('Campaign not found');
      if (campaign.organizerId !== ownerUserId) {
        throw new ForbiddenException('Access denied');
      }
    }
  }

  private toOwnerAppealView<
    T extends {
      decision: {
        id: string;
        subjectType: ModerationSubjectType;
        subjectId: string;
        outcome: ModerationStatus;
        reasonCodes: string[];
        customerExplanation: string | null;
        policyVersion?: string;
        createdAt: Date;
      };
    },
  >(appeal: T) {
    // Strip any accidental internal fields; decision select already omits them.
    return appeal;
  }
}
