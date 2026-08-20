import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  AdminMfaService,
  MFA_TOKEN_PURPOSE_CHALLENGE,
  MFA_TOKEN_PURPOSE_ENROLL,
} from './admin-mfa.service';
import { generateTotpCode } from './admin-mfa.totp';
import { hashRecoveryCode } from './admin-mfa.crypto';
import { AuthSurface, UserRole, UserStatus } from '../generated/prisma/enums';

describe('AdminMfaService', () => {
  const userId = 'admin-1';
  const adminUser = {
    id: userId,
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    phone: null,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
  };

  let service: AdminMfaService;
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock };
    adminMfaCredential: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    adminMfaRecoveryCode: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      updateMany: jest.Mock;
    };
    authSession: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let jwtService: JwtService;

  beforeEach(() => {
    process.env.MFA_TOTP_ENCRYPTION_KEY =
      'zghUm6jv4icb3WT8MzKea1lMrsgir7rONaShtv10zdQ=';

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(adminUser),
        findFirst: jest.fn().mockResolvedValue({ id: userId }),
      },
      adminMfaCredential: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      adminMfaRecoveryCode: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      authSession: { updateMany: jest.fn() },
      $transaction: jest.fn(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
      ),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    jwtService = new JwtService({
      secret: 'test-access-secret-ttw003-not-for-prod',
    });
    service = new AdminMfaService(
      prisma as never,
      {
        get: (key: string) =>
          key === 'MFA_TOTP_ENCRYPTION_KEY'
            ? process.env.MFA_TOTP_ENCRYPTION_KEY
            : undefined,
      } as ConfigService,
      jwtService,
      audit as never,
    );
  });

  it('startEnrollment returns otpauth + recovery codes and stores hashes only', async () => {
    prisma.adminMfaCredential.findUnique.mockResolvedValue(null);
    const token = service.signMfaToken(userId, MFA_TOKEN_PURPOSE_ENROLL);

    const result = await service.startEnrollment(token);

    expect(result.otpauth_uri).toMatch(/^otpauth:\/\/totp\//);
    expect(result.recovery_codes).toHaveLength(10);
    expect(prisma.adminMfaRecoveryCode.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId,
          codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    });
    const storedHashes = (
      prisma.adminMfaRecoveryCode.createMany.mock.calls[0][0].data as {
        codeHash: string;
      }[]
    ).map((row) => row.codeHash);
    for (const code of result.recovery_codes) {
      expect(storedHashes).toContain(hashRecoveryCode(code));
      expect(storedHashes.join(',')).not.toContain(code);
    }
  });

  it('confirmEnrollment enables MFA after a valid TOTP', async () => {
    const enrollToken = service.signMfaToken(userId, MFA_TOKEN_PURPOSE_ENROLL);
    prisma.adminMfaCredential.findUnique.mockResolvedValue(null);
    const started = await service.startEnrollment(enrollToken);
    const pending = prisma.adminMfaCredential.upsert.mock.calls[0][0];
    prisma.adminMfaCredential.findUnique.mockResolvedValue({
      userId,
      enabledAt: null,
      pendingSecretCiphertext: pending.create.pendingSecretCiphertext,
      pendingNonce: pending.create.pendingNonce,
      pendingKeyVersion: pending.create.pendingKeyVersion,
    });

    const user = await service.confirmEnrollment(
      enrollToken,
      generateTotpCode(started.secret),
    );

    expect(user.id).toBe(userId);
    expect(prisma.adminMfaCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        data: expect.objectContaining({
          enabledAt: expect.any(Date),
          pendingSecretCiphertext: null,
        }),
      }),
    );
  });

  it('challenge rejects wrong TOTP with generic 401', async () => {
    const enrollToken = service.signMfaToken(userId, MFA_TOKEN_PURPOSE_ENROLL);
    prisma.adminMfaCredential.findUnique.mockResolvedValue(null);
    const started = await service.startEnrollment(enrollToken);
    const pending = prisma.adminMfaCredential.upsert.mock.calls[0][0];
    prisma.adminMfaCredential.findUnique.mockResolvedValue({
      userId,
      enabledAt: null,
      pendingSecretCiphertext: pending.create.pendingSecretCiphertext,
      pendingNonce: pending.create.pendingNonce,
      pendingKeyVersion: pending.create.pendingKeyVersion,
    });
    await service.confirmEnrollment(
      enrollToken,
      generateTotpCode(started.secret),
    );
    prisma.adminMfaCredential.findUnique.mockResolvedValue({
      userId,
      enabledAt: new Date(),
      secretCiphertext: pending.create.pendingSecretCiphertext,
      secretNonce: pending.create.pendingNonce,
    });

    const challengeToken = service.signMfaToken(
      userId,
      MFA_TOKEN_PURPOSE_CHALLENGE,
    );
    await expect(service.challenge(challengeToken, '000000')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recover consumes a code once then rejects replay', async () => {
    const enrollToken = service.signMfaToken(userId, MFA_TOKEN_PURPOSE_ENROLL);
    prisma.adminMfaCredential.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ enabledAt: new Date() });
    const started = await service.startEnrollment(enrollToken);
    const code = started.recovery_codes[0];
    const challengeToken = service.signMfaToken(
      userId,
      MFA_TOKEN_PURPOSE_CHALLENGE,
    );

    prisma.adminMfaRecoveryCode.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(service.recover(challengeToken, code)).resolves.toMatchObject({
      id: userId,
    });
    await expect(service.recover(challengeToken, code)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects enroll token used on challenge purpose', async () => {
    const enrollToken = service.signMfaToken(userId, MFA_TOKEN_PURPOSE_ENROLL);
    await expect(service.challenge(enrollToken, '123456')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('signMfaToken embeds ADMIN surface and purpose', () => {
    const token = service.signMfaToken(userId, MFA_TOKEN_PURPOSE_CHALLENGE);
    const payload = jwtService.verify<{
      sub: string;
      purpose: string;
      surface: string;
    }>(token);
    expect(payload).toMatchObject({
      sub: userId,
      purpose: MFA_TOKEN_PURPOSE_CHALLENGE,
      surface: AuthSurface.ADMIN,
    });
  });
});
