import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  OrganizerApplicationStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { OrganizerApplicationsService } from './organizer-applications.service';
import { ORGANIZER_TERMS_VERSION } from './organizer.constants';

describe('OrganizerApplicationsService', () => {
  let service: OrganizerApplicationsService;
  let prisma: any;
  let audit: { log: jest.Mock };
  let authSessions: { revokeAllForUser: jest.Mock };
  let outboxDelivery: { enqueueDelivery: jest.Mock };

  const eligibleUser = {
    id: 'cust-1',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    firstName: 'Chioma',
    lastName: 'Okafor',
    phone: '+2348011111111',
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      organizerApplication: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      authToken: { deleteMany: jest.fn() },
      notificationOutbox: { create: jest.fn() },
      $transaction: jest.fn(),
      $executeRaw: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    authSessions = { revokeAllForUser: jest.fn().mockResolvedValue(1) };
    outboxDelivery = {
      enqueueDelivery: jest.fn().mockResolvedValue(undefined),
    };
    service = new OrganizerApplicationsService(
      prisma,
      audit as never,
      authSessions as never,
      outboxDelivery as never,
    );
  });

  it('submit rejects ineligible users', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...eligibleUser,
      emailVerifiedAt: null,
    });
    await expect(
      service.submit('cust-1', {
        organisationName: 'Lagos Relief',
        intendedUse: 'Raising funds for community school supplies and meals.',
        termsVersion: ORGANIZER_TERMS_VERSION,
        termsAcceptedAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit maps P2002 to conflict', async () => {
    prisma.user.findUnique.mockResolvedValue(eligibleUser);
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    prisma.organizerApplication.create.mockRejectedValue(err);
    await expect(
      service.submit('cust-1', {
        organisationName: 'Lagos Relief',
        intendedUse: 'Raising funds for community school supplies and meals.',
        termsVersion: ORGANIZER_TERMS_VERSION,
        termsAcceptedAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approve blocks self-review', async () => {
    prisma.organizerApplication.findUnique.mockResolvedValue({
      userId: 'admin-1',
    });
    await expect(service.approve('admin-1', 'app-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('approve atomically promotes role, revokes sessions, audits, and enqueues outbox', async () => {
    prisma.organizerApplication.findUnique
      .mockResolvedValueOnce({ userId: 'cust-1' })
      .mockResolvedValueOnce({
        id: 'app-1',
        userId: 'cust-1',
        status: OrganizerApplicationStatus.PENDING,
      });
    prisma.$transaction.mockImplementation((fn: any) => {
      const tx = {
        $executeRaw: jest.fn(),
        organizerApplication: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'app-1',
            userId: 'cust-1',
            status: OrganizerApplicationStatus.PENDING,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'cust-1',
            email: 'c@example.com',
            firstName: 'Chioma',
            role: UserRole.CUSTOMER,
            status: UserStatus.ACTIVE,
          }),
          update: jest.fn(),
        },
        authToken: { deleteMany: jest.fn() },
        notificationOutbox: {
          create: jest.fn().mockResolvedValue({ id: 'out-1' }),
        },
      };
      return Promise.resolve(fn(tx));
    });
    prisma.organizerApplication.findUnique.mockResolvedValue({
      id: 'app-1',
      status: OrganizerApplicationStatus.APPROVED,
      internalNotes: null,
      user: eligibleUser,
    });

    await service.approve('admin-2', 'app-1');
    expect(authSessions.revokeAllForUser).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();
    expect(outboxDelivery.enqueueDelivery).toHaveBeenCalledWith('out-1');
  });

  it('reject requires sanitized customer-visible reason path', async () => {
    prisma.organizerApplication.findUnique.mockResolvedValue({
      userId: 'cust-1',
    });
    prisma.$transaction.mockImplementation((fn: any) => {
      const tx = {
        $executeRaw: jest.fn(),
        organizerApplication: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'app-1',
            userId: 'cust-1',
            status: OrganizerApplicationStatus.PENDING,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'cust-1',
            email: 'c@example.com',
            firstName: 'Chioma',
          }),
        },
        notificationOutbox: {
          create: jest.fn().mockResolvedValue({ id: 'out-2' }),
        },
      };
      return Promise.resolve(fn(tx));
    });
    prisma.organizerApplication.findUnique.mockResolvedValue({
      id: 'app-1',
      status: OrganizerApplicationStatus.REJECTED,
      customerVisibleReason: 'Please clarify your intended use.',
      internalNotes: 'internal',
      user: eligibleUser,
    });

    const result = await service.reject('admin-2', 'app-1', {
      customerVisibleReason:
        'Please clarify your intended use for fundraising.',
      internalNotes: 'low confidence story',
    });
    expect(result.status).toBe(OrganizerApplicationStatus.REJECTED);
    expect(outboxDelivery.enqueueDelivery).toHaveBeenCalledWith('out-2');
  });

  it('override requires reason and creates approved application when missing', async () => {
    const tx = {
      organizerApplication: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          firstName: 'Chioma',
          lastName: 'Okafor',
          email: 'c@example.com',
        }),
      },
    };
    await expect(
      service.ensureApprovedApplicationForOverride(tx as never, {
        actorUserId: 'admin-1',
        targetUserId: 'cust-1',
        reason: 'short',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.ensureApprovedApplicationForOverride(tx as never, {
      actorUserId: 'admin-1',
      targetUserId: 'cust-1',
      reason: 'Manual promotion after offline KYC review call.',
    });
    expect(tx.organizerApplication.create).toHaveBeenCalled();
  });
});
