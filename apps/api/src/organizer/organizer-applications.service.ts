import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  AuditAction,
  AuditSource,
  NotificationChannel,
  OrganizerApplicationStatus,
  TokenType,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { evaluateOrganizerEligibility } from './organizer-eligibility';
import {
  ORGANIZER_ONBOARDING_POLICY_VERSION,
  ORGANIZER_TERMS_VERSION,
  OUTBOX_EVENT_ORGANIZER_APPLICATION_APPROVED,
  OUTBOX_EVENT_ORGANIZER_APPLICATION_REJECTED,
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASON_MIN,
  sanitizeCustomerVisibleReason,
} from './organizer.constants';
import { SubmitOrganizerApplicationDto } from './dto/submit-organizer-application.dto';
import { RejectOrganizerApplicationDto } from './dto/reject-organizer-application.dto';

type Tx = Prisma.TransactionClient;

const CUSTOMER_SELECT = {
  id: true,
  userId: true,
  organisationName: true,
  intendedUse: true,
  termsVersion: true,
  termsAcceptedAt: true,
  status: true,
  reviewedByUserId: true,
  reviewedAt: true,
  customerVisibleReason: true,
  policyVersion: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ADMIN_SELECT = {
  ...CUSTOMER_SELECT,
  internalNotes: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
    },
  },
} as const;

@Injectable()
export class OrganizerApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authSessions: AuthSessionService,
    private readonly outboxDelivery: NotificationOutboxDeliveryService,
  ) {}

  async getEligibility(userId: string) {
    const user = await this.requireUser(userId);
    const eligibility = evaluateOrganizerEligibility(user);
    const pendingApplication = await this.prisma.organizerApplication.findFirst(
      {
        where: { userId, status: OrganizerApplicationStatus.PENDING },
        select: CUSTOMER_SELECT,
        orderBy: { createdAt: 'desc' },
      },
    );
    const latestApplication = await this.prisma.organizerApplication.findFirst({
      where: { userId },
      select: CUSTOMER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...eligibility,
      pendingApplication,
      latestApplication,
      isOrganizer: user.role === UserRole.ORGANIZER,
    };
  }

  async getStatus(userId: string) {
    const user = await this.requireUser(userId);
    const latestApplication = await this.prisma.organizerApplication.findFirst({
      where: { userId },
      select: CUSTOMER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return {
      isOrganizer: user.role === UserRole.ORGANIZER,
      latestApplication,
    };
  }

  async submit(userId: string, dto: SubmitOrganizerApplicationDto) {
    const user = await this.requireUser(userId);
    const eligibility = evaluateOrganizerEligibility(user);
    if (!eligibility.eligible) {
      throw new BadRequestException({
        message: 'Not eligible to submit an organiser application',
        code: 'ORGANIZER_NOT_ELIGIBLE',
        gaps: eligibility.gaps,
        actionableGuidance: eligibility.actionableGuidance,
      });
    }
    if (dto.termsVersion !== ORGANIZER_TERMS_VERSION) {
      throw new BadRequestException({
        message:
          'Organiser terms version is out of date; accept the current terms',
        code: 'ORGANIZER_TERMS_VERSION_MISMATCH',
        requiredTermsVersion: ORGANIZER_TERMS_VERSION,
      });
    }

    const termsAcceptedAt = new Date(dto.termsAcceptedAt);
    if (Number.isNaN(termsAcceptedAt.getTime())) {
      throw new BadRequestException('termsAcceptedAt must be a valid ISO date');
    }

    try {
      const created = await this.prisma.organizerApplication.create({
        data: {
          userId,
          organisationName: dto.organisationName.trim(),
          intendedUse: dto.intendedUse.trim(),
          termsVersion: dto.termsVersion,
          termsAcceptedAt,
          status: OrganizerApplicationStatus.PENDING,
          policyVersion: ORGANIZER_ONBOARDING_POLICY_VERSION,
        },
        select: CUSTOMER_SELECT,
      });

      await this.audit.log({
        eventName: 'organizer.application.submitted',
        action: AuditAction.CREATE,
        entityType: 'OrganizerApplication',
        entityId: created.id,
        actorUserId: userId,
        actorRole: user.role,
        targetType: 'User',
        targetId: userId,
        after: { status: created.status },
        metadata: { policyVersion: created.policyVersion },
        source: AuditSource.PUBLIC_API,
      });

      return created;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'You already have a pending organiser application',
          code: 'ORGANIZER_APPLICATION_PENDING_EXISTS',
        });
      }
      throw err;
    }
  }

  async withdraw(userId: string, applicationId: string) {
    const updated = await this.prisma.organizerApplication.updateMany({
      where: {
        id: applicationId,
        userId,
        status: OrganizerApplicationStatus.PENDING,
      },
      data: { status: OrganizerApplicationStatus.WITHDRAWN },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Pending application not found');
    }
    const row = await this.prisma.organizerApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: CUSTOMER_SELECT,
    });
    await this.audit.log({
      eventName: 'organizer.application.withdrawn',
      action: AuditAction.UPDATE,
      entityType: 'OrganizerApplication',
      entityId: applicationId,
      actorUserId: userId,
      actorRole: UserRole.CUSTOMER,
      after: { status: OrganizerApplicationStatus.WITHDRAWN },
      source: AuditSource.PUBLIC_API,
    });
    return row;
  }

  async listForAdmin(status?: OrganizerApplicationStatus) {
    return this.prisma.organizerApplication.findMany({
      where: status ? { status } : undefined,
      select: ADMIN_SELECT,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async getForAdmin(applicationId: string) {
    const row = await this.prisma.organizerApplication.findUnique({
      where: { id: applicationId },
      select: ADMIN_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Application not found');
    }
    return row;
  }

  async approve(
    adminUserId: string,
    applicationId: string,
    internalNotes?: string,
  ) {
    const applicantUserId = await this.getApplicantUserId(applicationId);
    if (adminUserId === applicantUserId) {
      throw new ForbiddenException(
        'Admins cannot approve their own application',
      );
    }

    const outboxId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM organizer_applications WHERE id = ${applicationId} FOR UPDATE
      `;

      const app = await tx.organizerApplication.findUnique({
        where: { id: applicationId },
      });
      if (!app) {
        throw new NotFoundException('Application not found');
      }
      if (app.status !== OrganizerApplicationStatus.PENDING) {
        throw new ConflictException('Application is not pending');
      }
      if (app.userId === adminUserId) {
        throw new ForbiddenException(
          'Admins cannot approve their own application',
        );
      }

      const user = await tx.user.findUniqueOrThrow({
        where: { id: app.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          role: true,
          status: true,
        },
      });
      if (user.status !== UserStatus.ACTIVE) {
        throw new BadRequestException('Applicant account is not active');
      }
      if (user.role !== UserRole.CUSTOMER && user.role !== UserRole.ORGANIZER) {
        throw new BadRequestException('Applicant role cannot be promoted');
      }

      const claimed = await tx.organizerApplication.updateMany({
        where: {
          id: applicationId,
          status: OrganizerApplicationStatus.PENDING,
        },
        data: {
          status: OrganizerApplicationStatus.APPROVED,
          reviewedByUserId: adminUserId,
          reviewedAt: new Date(),
          internalNotes: internalNotes?.trim() || null,
          customerVisibleReason: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Application is not pending');
      }

      if (user.role === UserRole.CUSTOMER) {
        await tx.user.update({
          where: { id: user.id },
          data: { role: UserRole.ORGANIZER },
        });
        await tx.authToken.deleteMany({
          where: { userId: user.id, tokenType: TokenType.REFRESH },
        });
        await this.authSessions.revokeAllForUser(user.id, tx);
      }

      await this.audit.log(
        {
          eventName: 'organizer.application.approved',
          action: AuditAction.APPROVE,
          entityType: 'OrganizerApplication',
          entityId: applicationId,
          actorUserId: adminUserId,
          actorRole: UserRole.ADMIN,
          targetType: 'User',
          targetId: user.id,
          before: {
            role: user.role,
            status: OrganizerApplicationStatus.PENDING,
          },
          after: {
            role: UserRole.ORGANIZER,
            status: OrganizerApplicationStatus.APPROVED,
          },
          metadata: { policyVersion: ORGANIZER_ONBOARDING_POLICY_VERSION },
          source: AuditSource.ADMIN_API,
        },
        tx,
      );

      const outbox = await tx.notificationOutbox.create({
        data: {
          eventName: OUTBOX_EVENT_ORGANIZER_APPLICATION_APPROVED,
          channel: NotificationChannel.EMAIL,
          recipient: user.email,
          recipientUserId: user.id,
          dedupeKey: `${OUTBOX_EVENT_ORGANIZER_APPLICATION_APPROVED}:${applicationId}`,
          payload: {
            applicationId,
            firstName: user.firstName,
          },
        },
      });
      return outbox.id;
    });

    await this.outboxDelivery.enqueueDelivery(outboxId);
    return this.getForAdmin(applicationId);
  }

  async reject(
    adminUserId: string,
    applicationId: string,
    dto: RejectOrganizerApplicationDto,
  ) {
    const applicantUserId = await this.getApplicantUserId(applicationId);
    if (adminUserId === applicantUserId) {
      throw new ForbiddenException(
        'Admins cannot reject their own application',
      );
    }

    const reason = sanitizeCustomerVisibleReason(dto.customerVisibleReason);

    const outboxId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM organizer_applications WHERE id = ${applicationId} FOR UPDATE
      `;

      const app = await tx.organizerApplication.findUnique({
        where: { id: applicationId },
      });
      if (!app) {
        throw new NotFoundException('Application not found');
      }
      if (app.status !== OrganizerApplicationStatus.PENDING) {
        throw new ConflictException('Application is not pending');
      }
      if (app.userId === adminUserId) {
        throw new ForbiddenException(
          'Admins cannot reject their own application',
        );
      }

      const user = await tx.user.findUniqueOrThrow({
        where: { id: app.userId },
        select: { id: true, email: true, firstName: true },
      });

      const claimed = await tx.organizerApplication.updateMany({
        where: {
          id: applicationId,
          status: OrganizerApplicationStatus.PENDING,
        },
        data: {
          status: OrganizerApplicationStatus.REJECTED,
          reviewedByUserId: adminUserId,
          reviewedAt: new Date(),
          customerVisibleReason: reason,
          internalNotes: dto.internalNotes?.trim() || null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Application is not pending');
      }

      await this.audit.log(
        {
          eventName: 'organizer.application.rejected',
          action: AuditAction.REJECT,
          entityType: 'OrganizerApplication',
          entityId: applicationId,
          actorUserId: adminUserId,
          actorRole: UserRole.ADMIN,
          targetType: 'User',
          targetId: user.id,
          after: { status: OrganizerApplicationStatus.REJECTED },
          metadata: { policyVersion: ORGANIZER_ONBOARDING_POLICY_VERSION },
          source: AuditSource.ADMIN_API,
        },
        tx,
      );

      const outbox = await tx.notificationOutbox.create({
        data: {
          eventName: OUTBOX_EVENT_ORGANIZER_APPLICATION_REJECTED,
          channel: NotificationChannel.EMAIL,
          recipient: user.email,
          recipientUserId: user.id,
          dedupeKey: `${OUTBOX_EVENT_ORGANIZER_APPLICATION_REJECTED}:${applicationId}`,
          payload: {
            applicationId,
            firstName: user.firstName,
            customerVisibleReason: reason,
          },
        },
      });
      return outbox.id;
    });

    await this.outboxDelivery.enqueueDelivery(outboxId);
    return this.getForAdmin(applicationId);
  }

  /**
   * Admin CUSTOMER→ORGANIZER override helper. Requires reason; creates an
   * equivalent APPROVED application when missing. Caller owns the transaction.
   */
  async ensureApprovedApplicationForOverride(
    tx: Tx,
    params: {
      actorUserId: string;
      targetUserId: string;
      reason: string;
    },
  ): Promise<void> {
    const reason = params.reason.trim();
    if (
      reason.length < OVERRIDE_REASON_MIN ||
      reason.length > OVERRIDE_REASON_MAX
    ) {
      throw new BadRequestException(
        `CUSTOMER→ORGANIZER override requires a reason (${OVERRIDE_REASON_MIN}–${OVERRIDE_REASON_MAX} characters)`,
      );
    }

    // Always clear PENDING rows first so a concurrent pending application
    // cannot violate organizer_applications_one_pending_per_user when an
    // APPROVED row already exists (or when we create one below).
    await tx.organizerApplication.updateMany({
      where: {
        userId: params.targetUserId,
        status: OrganizerApplicationStatus.PENDING,
      },
      data: { status: OrganizerApplicationStatus.WITHDRAWN },
    });

    const existingApproved = await tx.organizerApplication.findFirst({
      where: {
        userId: params.targetUserId,
        status: OrganizerApplicationStatus.APPROVED,
      },
      select: { id: true },
    });
    if (existingApproved) {
      return;
    }

    const target = await tx.user.findUniqueOrThrow({
      where: { id: params.targetUserId },
      select: { firstName: true, lastName: true, email: true },
    });
    const organisationName =
      `${target.firstName} ${target.lastName}`.trim() || target.email;

    await tx.organizerApplication.create({
      data: {
        userId: params.targetUserId,
        organisationName: organisationName.slice(0, 120),
        intendedUse:
          'Admin override: organiser role granted directly by an administrator.',
        termsVersion: ORGANIZER_TERMS_VERSION,
        termsAcceptedAt: new Date(),
        status: OrganizerApplicationStatus.APPROVED,
        reviewedByUserId: params.actorUserId,
        reviewedAt: new Date(),
        customerVisibleReason: null,
        internalNotes: `ADMIN_OVERRIDE: ${reason}`.slice(0, 2000),
        policyVersion: ORGANIZER_ONBOARDING_POLICY_VERSION,
      },
    });
  }

  private async getApplicantUserId(applicationId: string): Promise<string> {
    const row = await this.prisma.organizerApplication.findUnique({
      where: { id: applicationId },
      select: { userId: true },
    });
    if (!row) {
      throw new NotFoundException('Application not found');
    }
    return row.userId;
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    });
    if (!user || user.status === UserStatus.DELETED) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
