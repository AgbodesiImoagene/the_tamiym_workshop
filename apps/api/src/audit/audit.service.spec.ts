import { AuditAction, AuditOutcome } from '../generated/prisma/enums';
import { AuditService } from './audit.service';
import { runWithRequestContext } from '../request-context/request-context.store';

describe('AuditService', () => {
  const prisma = {
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditService(prisma as never);
  });

  it('should merge request context into the audit row', async () => {
    await runWithRequestContext(
      {
        requestId: 'req-1',
        actorUserId: 'user-1',
        actorRole: 'ADMIN',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        source: 'ADMIN_API',
      },
      () =>
        service.log({
          eventName: 'admin.test.updated',
          action: AuditAction.UPDATE,
          entityType: 'Thing',
          entityId: 'thing-1',
        }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'req-1',
        actorUserId: 'user-1',
        actorRole: 'ADMIN',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        source: 'ADMIN_API',
      }),
    });
  });

  it('should redact sensitive nested fields', async () => {
    await service.log({
      eventName: 'auth.password.changed',
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: 'user-1',
      outcome: AuditOutcome.SUCCESS,
      after: {
        password: 'secret',
        profile: {
          refreshToken: 'token-value',
        },
      },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        after: {
          password: '[REDACTED]',
          profile: {
            refreshToken: '[REDACTED]',
          },
        },
      }),
    });
  });
});
