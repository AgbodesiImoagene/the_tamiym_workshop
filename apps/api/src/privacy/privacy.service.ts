import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { AuditService } from '../audit/audit.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import {
  AuditAction,
  AuditSource,
  CampaignStatus,
  OrderStatus,
  PayoutStatus,
  PrivacyRequestStatus,
  PrivacyRequestType,
  UserStatus,
} from '../generated/prisma/enums';
import {
  PRIVACY_EXPORT_TTL_MS,
  PRIVACY_OPEN_OBLIGATIONS,
  PRIVACY_PASSWORD_REQUIRED,
  PRIVACY_POLICY_VERSION,
} from './privacy.constants';
import { Prisma } from '../generated/prisma/client';

/** Orders still requiring customer/fulfilment activity before closure. */
const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DRAFT,
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
];

const OPEN_CAMPAIGN_STATUSES: CampaignStatus[] = [
  CampaignStatus.DRAFT,
  CampaignStatus.REVIEW,
  CampaignStatus.ACTIVE,
  CampaignStatus.PAUSED,
];

const OPEN_PAYOUT_STATUSES: PayoutStatus[] = [
  PayoutStatus.DRAFT,
  PayoutStatus.PENDING_APPROVAL,
  PayoutStatus.APPROVED,
  PayoutStatus.QUEUED,
  PayoutStatus.PROCESSING,
  PayoutStatus.INITIATED,
];

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authSessions: AuthSessionService,
    private readonly audit: AuditService,
    private readonly moderationDecisions: ModerationDecisionService,
  ) {}

  listForUser(userId: string) {
    return this.prisma.privacyRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        policyVersion: true,
        legalHoldUntil: true,
        exportExpiresAt: true,
        completedAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getForUser(userId: string, requestId: string) {
    const row = await this.prisma.privacyRequest.findFirst({
      where: { id: requestId, userId },
      include: {
        actions: {
          select: {
            systemCode: true,
            outcomeCode: true,
            evidence: true,
            attempt: true,
            completedAt: true,
          },
          orderBy: { completedAt: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Privacy request not found');
    return row;
  }

  async requestExport(userId: string, password: string) {
    await this.assertPassword(userId, password);
    const now = new Date();
    const request = await this.prisma.privacyRequest.create({
      data: {
        userId,
        type: PrivacyRequestType.EXPORT,
        status: PrivacyRequestStatus.COMPLETED,
        policyVersion: PRIVACY_POLICY_VERSION,
        exportExpiresAt: new Date(now.getTime() + PRIVACY_EXPORT_TTL_MS),
        completedAt: now,
      },
    });
    await this.recordAction(request.id, 'export.package', 'OK', {
      note: 'Export packaged on demand within download TTL',
    });
    await this.audit.log({
      eventName: 'privacy.export.requested',
      action: AuditAction.CREATE,
      entityType: 'PrivacyRequest',
      entityId: request.id,
      actorUserId: userId,
      source: AuditSource.PUBLIC_API,
      note: 'User requested personal data export',
    });
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      policyVersion: request.policyVersion,
      exportExpiresAt: request.exportExpiresAt,
      downloadPath: `privacy/requests/${request.id}/export`,
    };
  }

  async downloadExport(userId: string, requestId: string, password: string) {
    await this.assertPassword(userId, password);
    const request = await this.prisma.privacyRequest.findFirst({
      where: {
        id: requestId,
        userId,
        type: PrivacyRequestType.EXPORT,
      },
    });
    if (!request) throw new NotFoundException('Privacy request not found');
    if (
      request.status !== PrivacyRequestStatus.COMPLETED ||
      !request.exportExpiresAt ||
      request.exportExpiresAt.getTime() < Date.now()
    ) {
      throw new GoneException('Export download expired or unavailable');
    }

    const payload = await this.buildExportPayload(userId);
    const body = JSON.stringify(payload);
    const checksum = createHash('sha256').update(body, 'utf8').digest('hex');
    await this.prisma.privacyRequest.update({
      where: { id: request.id },
      data: { exportChecksum: checksum },
    });
    await this.audit.log({
      eventName: 'privacy.export.downloaded',
      action: AuditAction.APPROVE,
      entityType: 'PrivacyRequest',
      entityId: request.id,
      actorUserId: userId,
      source: AuditSource.PUBLIC_API,
      note: 'User downloaded personal data export',
      metadata: { checksum },
    });
    return {
      policyVersion: PRIVACY_POLICY_VERSION,
      checksum,
      expiresAt: request.exportExpiresAt,
      data: payload,
    };
  }

  async requestErasure(userId: string, password: string) {
    await this.assertPassword(userId, password);
    await this.assertNoOpenObligations(userId);

    const existing = await this.prisma.privacyRequest.findFirst({
      where: {
        userId,
        type: PrivacyRequestType.ERASURE,
        status: {
          in: [
            PrivacyRequestStatus.PENDING,
            PrivacyRequestStatus.IN_PROGRESS,
            PrivacyRequestStatus.HELD,
            PrivacyRequestStatus.COMPLETED,
          ],
        },
      },
    });
    if (existing?.status === PrivacyRequestStatus.COMPLETED) {
      throw new ConflictException('Account erasure already completed');
    }
    if (existing?.status === PrivacyRequestStatus.HELD) {
      const holdUntil = existing.legalHoldUntil?.getTime() ?? 0;
      if (holdUntil > Date.now()) {
        return this.getForUser(userId, existing.id);
      }
      // Hold expired — resume executors on the same request row.
      return this.runErasure(userId, existing.id);
    }
    if (
      existing?.status === PrivacyRequestStatus.PENDING ||
      existing?.status === PrivacyRequestStatus.IN_PROGRESS
    ) {
      // Crash / mid-flight failure left a resumable row; do not create another
      // (partial unique index also enforces one active erasure per user).
      return this.runErasure(userId, existing.id);
    }

    let requestId: string;
    try {
      const request = await this.prisma.privacyRequest.create({
        data: {
          userId,
          type: PrivacyRequestType.ERASURE,
          status: PrivacyRequestStatus.IN_PROGRESS,
          policyVersion: PRIVACY_POLICY_VERSION,
        },
      });
      requestId = request.id;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.prisma.privacyRequest.findFirst({
          where: {
            userId,
            type: PrivacyRequestType.ERASURE,
            status: {
              in: [
                PrivacyRequestStatus.PENDING,
                PrivacyRequestStatus.IN_PROGRESS,
                PrivacyRequestStatus.HELD,
              ],
            },
          },
        });
        if (raced) return this.runErasure(userId, raced.id);
      }
      throw err;
    }

    return this.runErasure(userId, requestId);
  }

  private async runErasure(userId: string, requestId: string) {
    try {
      await this.assertNoOpenObligations(userId);
      await this.prisma.privacyRequest.updateMany({
        where: {
          id: requestId,
          status: {
            in: [
              PrivacyRequestStatus.PENDING,
              PrivacyRequestStatus.IN_PROGRESS,
              PrivacyRequestStatus.HELD,
            ],
          },
        },
        data: { status: PrivacyRequestStatus.IN_PROGRESS, lastErrorCode: null },
      });
      await this.executeErasure(userId, requestId);
      return this.getForUser(userId, requestId);
    } catch (err) {
      // Never overwrite COMPLETED/HELD if executors already finished.
      await this.prisma.privacyRequest.updateMany({
        where: {
          id: requestId,
          status: PrivacyRequestStatus.IN_PROGRESS,
        },
        data: {
          status: PrivacyRequestStatus.FAILED,
          lastErrorCode: 'ERASURE_FAILED',
        },
      });
      throw err;
    }
  }

  async cancel(userId: string, requestId: string) {
    const request = await this.prisma.privacyRequest.findFirst({
      where: { id: requestId, userId },
    });
    if (!request) throw new NotFoundException('Privacy request not found');
    if (request.type === PrivacyRequestType.ERASURE) {
      throw new BadRequestException('Erasure requests cannot be cancelled');
    }
    const now = new Date();
    const canCancelPending = request.status === PrivacyRequestStatus.PENDING;
    const canRevokeExport =
      request.type === PrivacyRequestType.EXPORT &&
      request.status === PrivacyRequestStatus.COMPLETED &&
      !!request.exportExpiresAt &&
      request.exportExpiresAt.getTime() > now.getTime();
    if (!canCancelPending && !canRevokeExport) {
      throw new ConflictException(
        'Only pending or unexpired export downloads can be cancelled',
      );
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: {
        status: PrivacyRequestStatus.CANCELLED,
        cancelledAt: now,
        exportExpiresAt: now,
      },
    });
  }

  private async executeErasure(userId: string, requestId: string) {
    const hold = await this.prisma.privacyRequest.findUnique({
      where: { id: requestId },
      select: { legalHoldUntil: true },
    });
    if (hold?.legalHoldUntil && hold.legalHoldUntil.getTime() > Date.now()) {
      await this.prisma.privacyRequest.update({
        where: { id: requestId },
        data: { status: PrivacyRequestStatus.HELD },
      });
      await this.recordAction(requestId, 'erasure.gate', 'LEGAL_HOLD', {});
      return;
    }

    const tombstoneEmail = `deleted_${userId}@privacy.invalid`;

    await this.prisma.$transaction(async (tx) => {
      const [openOrders, openCampaigns, openPayouts] = await Promise.all([
        tx.order.count({
          where: { userId, status: { in: OPEN_ORDER_STATUSES } },
        }),
        tx.campaign.count({
          where: {
            organizerId: userId,
            status: { in: OPEN_CAMPAIGN_STATUSES },
          },
        }),
        tx.payout.count({
          where: {
            recipientUserId: userId,
            status: { in: OPEN_PAYOUT_STATUSES },
          },
        }),
      ]);
      if (openOrders + openCampaigns + openPayouts > 0) {
        throw new ForbiddenException({
          code: PRIVACY_OPEN_OBLIGATIONS,
          message:
            'Account erasure is blocked while open orders, campaigns, or payouts remain.',
          openOrders,
          openCampaigns,
          openPayouts,
        });
      }

      // Disable login first so a mid-flight failure cannot leave an ACTIVE
      // password-authenticated account after sessions were revoked.
      await tx.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.DELETED,
          email: tombstoneEmail,
          passwordHash: null,
          firstName: 'Deleted',
          lastName: 'User',
          phone: null,
          emailVerifiedAt: null,
        },
      });
      await this.recordActionTx(tx, requestId, 'postgres.user', 'OK', {
        tombstone: true,
      });

      const revoked = await this.authSessions.revokeAllForUser(userId, tx);
      await this.recordActionTx(tx, requestId, 'postgres.sessions', 'OK', {
        revoked,
      });

      await tx.authToken.deleteMany({ where: { userId } });
      await tx.adminMfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.adminMfaCredential.deleteMany({ where: { userId } });
      await tx.userOAuthAccount.deleteMany({ where: { userId } });
      await this.recordActionTx(
        tx,
        requestId,
        'postgres.auth_credentials',
        'OK',
        {},
      );

      await tx.address.updateMany({
        where: { userId },
        data: {
          recipientName: 'Deleted',
          phone: null,
          addressLine1: 'REDACTED',
          addressLine2: null,
          city: 'REDACTED',
          state: 'REDACTED',
          postalCode: null,
          landmark: null,
          instructions: null,
          locality: null,
          dependentLocality: null,
          administrativeAreaLevel1: null,
          administrativeAreaLevel2: null,
          formattedAddress: null,
          googlePlaceId: null,
          latitude: null,
          longitude: null,
          normalizationMetadata: Prisma.JsonNull,
        },
      });
      await this.recordActionTx(tx, requestId, 'postgres.addresses', 'OK', {});

      const ordersRedacted = await tx.order.updateMany({
        where: { userId },
        data: {
          shipRecipientName: 'Deleted',
          shipPhone: null,
          shipLine1: 'REDACTED',
          shipLine2: null,
          shipCity: 'REDACTED',
          shipState: 'REDACTED',
          shipPostalCode: null,
          shipLandmark: null,
          shipInstructions: null,
        },
      });
      await this.recordActionTx(
        tx,
        requestId,
        'postgres.order_shipping_snapshots',
        'OK',
        { redacted: ordersRedacted.count },
      );

      const payoutsRedacted = await tx.userPayoutProfile.updateMany({
        where: { userId },
        data: {
          label: null,
          bankName: null,
          bankCode: '000',
          accountName: 'REDACTED',
          accountNumber: '0000000000',
          recipientCode: null,
          isDefault: false,
        },
      });
      await this.recordActionTx(
        tx,
        requestId,
        'postgres.payout_profiles',
        'OK',
        { redacted: payoutsRedacted.count },
      );

      const campaignPayouts = await tx.campaign.updateMany({
        where: { organizerId: userId },
        data: {
          payoutBankName: null,
          payoutBankCode: null,
          payoutAccountName: null,
          payoutAccountNo: null,
          payoutProfileId: null,
        },
      });
      await this.recordActionTx(
        tx,
        requestId,
        'postgres.campaign_payout_snapshots',
        'OK',
        { redacted: campaignPayouts.count },
      );

      const shareCleared = await tx.design.updateMany({
        where: { userId, shareToken: { not: null } },
        data: { shareToken: null, shareTokenExpiresAt: null },
      });
      const digestedRevoked = await tx.designShareLink.updateMany({
        where: {
          revokedAt: null,
          design: { userId },
        },
        data: { revokedAt: new Date() },
      });
      await this.recordActionTx(tx, requestId, 'postgres.design_shares', 'OK', {
        cleared: shareCleared.count,
        revokedLinks: digestedRevoked.count,
      });

      const appealsWithdrawn =
        await this.moderationDecisions.withdrawPendingAppealsForOwnerInTx(
          tx,
          userId,
        );
      await this.recordActionTx(
        tx,
        requestId,
        'postgres.moderation_appeals',
        'OK',
        { withdrawnPending: appealsWithdrawn },
      );

      await this.recordActionTx(
        tx,
        requestId,
        'object_store.media',
        'PROVIDER_DEFERRED',
        {},
      );
      await this.recordActionTx(
        tx,
        requestId,
        'provider.mail',
        'PROVIDER_DEFERRED',
        {},
      );
      await this.recordActionTx(
        tx,
        requestId,
        'provider.paystack',
        'PROVIDER_DEFERRED',
        {},
      );

      await tx.privacyRequest.update({
        where: { id: requestId },
        data: {
          status: PrivacyRequestStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    });

    try {
      await this.audit.log({
        eventName: 'privacy.erasure.completed',
        action: AuditAction.DELETE,
        entityType: 'PrivacyRequest',
        entityId: requestId,
        actorUserId: userId,
        source: AuditSource.PUBLIC_API,
        note: 'Account erasure completed under interim privacy policy',
      });
    } catch {
      // Audit failure must not flip COMPLETED → FAILED after tombstone.
    }
  }

  private async buildExportPayload(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      select: {
        id: true,
        recipientName: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        stateCode: true,
        postalCode: true,
        countryCode: true,
        isDefault: true,
      },
    });
    const orders = await this.prisma.order.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        currency: true,
        totalAmount: true,
        createdAt: true,
      },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
    const designs = await this.prisma.design.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        productId: true,
        campaignId: true,
        moderationStatus: true,
        createdAt: true,
        updatedAt: true,
        shareLinks: {
          select: {
            id: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
    return {
      exportedAt: new Date().toISOString(),
      policyVersion: PRIVACY_POLICY_VERSION,
      user,
      addresses,
      orders,
      designs: designs.map(({ shareLinks, ...rest }) => {
        const active = shareLinks.filter((l) => !l.revokedAt);
        const now = Date.now();
        return {
          ...rest,
          shareLinkCount: shareLinks.length,
          activeShareLinkCount: active.filter(
            (l) => l.expiresAt.getTime() > now,
          ).length,
          hadShareLink: shareLinks.length > 0,
        };
      }),
    };
  }

  private async assertPassword(userId: string, password: string) {
    if (!password || password.length < 8) {
      throw new UnauthorizedException('Re-authentication required');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Re-authentication required');
    }
    if (!user.passwordHash) {
      throw new ForbiddenException({
        code: PRIVACY_PASSWORD_REQUIRED,
        message:
          'Set a password on this account before requesting export or erasure. OAuth step-up re-auth is not available in this release.',
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Re-authentication required');
  }

  private async assertNoOpenObligations(userId: string) {
    const [openOrders, openCampaigns, openPayouts] = await Promise.all([
      this.prisma.order.count({
        where: { userId, status: { in: OPEN_ORDER_STATUSES } },
      }),
      this.prisma.campaign.count({
        where: { organizerId: userId, status: { in: OPEN_CAMPAIGN_STATUSES } },
      }),
      this.prisma.payout.count({
        where: {
          recipientUserId: userId,
          status: { in: OPEN_PAYOUT_STATUSES },
        },
      }),
    ]);
    if (openOrders + openCampaigns + openPayouts > 0) {
      throw new ForbiddenException({
        code: PRIVACY_OPEN_OBLIGATIONS,
        message:
          'Account erasure is blocked while open orders, campaigns, or payouts remain.',
        openOrders,
        openCampaigns,
        openPayouts,
      });
    }
  }

  private recordAction(
    requestId: string,
    systemCode: string,
    outcomeCode: string,
    evidence: Record<string, Prisma.InputJsonValue>,
  ) {
    return this.recordActionTx(
      this.prisma,
      requestId,
      systemCode,
      outcomeCode,
      evidence,
    );
  }

  private recordActionTx(
    db: Prisma.TransactionClient | PrismaService,
    requestId: string,
    systemCode: string,
    outcomeCode: string,
    evidence: Record<string, Prisma.InputJsonValue>,
  ) {
    return db.privacyRequestAction.create({
      data: {
        requestId,
        systemCode,
        outcomeCode,
        evidence: evidence as Prisma.InputJsonValue,
      },
    });
  }
}
