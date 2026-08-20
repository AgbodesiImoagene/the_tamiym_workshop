import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditSource,
  AuthSurface,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import {
  decodeMfaEncryptionKey,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  MFA_TOTP_KEY_VERSION,
} from './admin-mfa.crypto';
import { buildTotpUri, mintTotpSecret, verifyTotpCode } from './admin-mfa.totp';

export const MFA_TOKEN_PURPOSE_ENROLL = 'mfa_enroll' as const;
export const MFA_TOKEN_PURPOSE_CHALLENGE = 'mfa_challenge' as const;
export type MfaTokenPurpose =
  | typeof MFA_TOKEN_PURPOSE_ENROLL
  | typeof MFA_TOKEN_PURPOSE_CHALLENGE;

export const MFA_CHALLENGE_TTL = '5m';

export type MfaChallengeResponse = {
  mfa: { status: 'ENROLLMENT_REQUIRED' | 'CHALLENGE_REQUIRED' };
  mfa_token: string;
};

export type AdminUserForSession = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
};

type MfaTokenPayload = {
  sub: string;
  purpose: MfaTokenPurpose;
  surface: typeof AuthSurface.ADMIN;
};

const GENERIC_MFA_UNAUTHORIZED = 'Unauthorized';

@Injectable()
export class AdminMfaService {
  private encryptionKey: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  private getKey(): Buffer {
    if (!this.encryptionKey) {
      this.encryptionKey = decodeMfaEncryptionKey(
        this.config.get<string>('MFA_TOTP_ENCRYPTION_KEY'),
      );
    }
    return this.encryptionKey;
  }

  /** Whether the admin has completed MFA enrollment. */
  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.prisma.adminMfaCredential.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    return row?.enabledAt != null;
  }

  /** Sign a short-lived MFA challenge/enroll JWT (not a session). */
  signMfaToken(userId: string, purpose: MfaTokenPurpose): string {
    const payload: MfaTokenPayload = {
      sub: userId,
      purpose,
      surface: AuthSurface.ADMIN,
    };
    return this.jwtService.sign(payload, { expiresIn: MFA_CHALLENGE_TTL });
  }

  private verifyMfaToken(
    token: string,
    expectedPurpose: MfaTokenPurpose,
  ): MfaTokenPayload {
    let payload: MfaTokenPayload;
    try {
      payload = this.jwtService.verify<MfaTokenPayload>(token);
    } catch {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }
    if (
      !payload?.sub ||
      payload.purpose !== expectedPurpose ||
      payload.surface !== AuthSurface.ADMIN
    ) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }
    return payload;
  }

  private async requireActiveAdmin(
    userId: string,
  ): Promise<AdminUserForSession> {
    const user = await this.prisma.user.findUnique({
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
      },
    });
    if (
      !user ||
      user.role !== UserRole.ADMIN ||
      user.status !== UserStatus.ACTIVE ||
      !user.emailVerifiedAt
    ) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      status: user.status,
    };
  }

  /**
   * Start enrollment: persist pending encrypted secret + hashed recovery codes.
   * Returns otpauth URI and recovery codes plaintext once.
   */
  async startEnrollment(mfaToken: string): Promise<{
    otpauth_uri: string;
    secret: string;
    recovery_codes: string[];
  }> {
    const { sub: userId } = this.verifyMfaToken(
      mfaToken,
      MFA_TOKEN_PURPOSE_ENROLL,
    );
    const user = await this.requireActiveAdmin(userId);

    const existing = await this.prisma.adminMfaCredential.findUnique({
      where: { userId },
    });
    if (existing?.enabledAt) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }

    const secret = mintTotpSecret();
    const encrypted = encryptTotpSecret(secret, this.getKey());
    const recoveryCodes = generateRecoveryCodes(10);

    await this.prisma.$transaction(async (tx) => {
      await tx.adminMfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.adminMfaCredential.upsert({
        where: { userId },
        create: {
          userId,
          pendingSecretCiphertext: encrypted.ciphertext,
          pendingNonce: encrypted.nonce,
          pendingKeyVersion: encrypted.keyVersion,
          keyVersion: MFA_TOTP_KEY_VERSION,
        },
        update: {
          pendingSecretCiphertext: encrypted.ciphertext,
          pendingNonce: encrypted.nonce,
          pendingKeyVersion: encrypted.keyVersion,
          secretCiphertext: null,
          secretNonce: null,
          enabledAt: null,
        },
      });
      await tx.adminMfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId,
          codeHash: hashRecoveryCode(code),
        })),
      });
      await this.audit.log(
        {
          eventName: 'auth.admin.mfa.enroll_started',
          action: AuditAction.CREATE,
          entityType: 'AdminMfaCredential',
          entityId: userId,
          actorUserId: userId,
          actorRole: UserRole.ADMIN,
          note: 'Admin MFA enrollment started',
        },
        tx,
      );
    });

    return {
      otpauth_uri: buildTotpUri(secret, user.email),
      secret,
      recovery_codes: recoveryCodes,
    };
  }

  /**
   * Confirm enrollment with a valid TOTP. Returns the admin user for session
   * issuance by AuthService (does not mint cookies/tokens itself).
   */
  async confirmEnrollment(
    mfaToken: string,
    totp: string,
  ): Promise<AdminUserForSession> {
    const { sub: userId } = this.verifyMfaToken(
      mfaToken,
      MFA_TOKEN_PURPOSE_ENROLL,
    );
    const user = await this.requireActiveAdmin(userId);

    const credential = await this.prisma.adminMfaCredential.findUnique({
      where: { userId },
    });
    if (
      !credential?.pendingSecretCiphertext ||
      !credential.pendingNonce ||
      credential.enabledAt
    ) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }

    let secret: string;
    try {
      secret = decryptTotpSecret(
        credential.pendingSecretCiphertext,
        credential.pendingNonce,
        this.getKey(),
      );
    } catch {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }

    if (!verifyTotpCode(totp, secret)) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }

    const keyVersion = credential.pendingKeyVersion ?? MFA_TOTP_KEY_VERSION;

    await this.prisma.adminMfaCredential.update({
      where: { userId },
      data: {
        secretCiphertext: credential.pendingSecretCiphertext,
        secretNonce: credential.pendingNonce,
        keyVersion,
        enabledAt: new Date(),
        pendingSecretCiphertext: null,
        pendingNonce: null,
        pendingKeyVersion: null,
      },
    });

    await this.audit.log({
      eventName: 'auth.admin.mfa.enroll_confirmed',
      action: AuditAction.UPDATE,
      entityType: 'AdminMfaCredential',
      entityId: userId,
      actorUserId: userId,
      actorRole: UserRole.ADMIN,
      note: 'Admin MFA enrollment confirmed',
    });

    return user;
  }

  /** Verify TOTP challenge; returns admin user for session issuance. */
  async challenge(
    mfaToken: string,
    totp: string,
  ): Promise<AdminUserForSession> {
    const { sub: userId } = this.verifyMfaToken(
      mfaToken,
      MFA_TOKEN_PURPOSE_CHALLENGE,
    );
    const user = await this.requireActiveAdmin(userId);
    const secret = await this.loadEnabledSecret(userId);
    if (!verifyTotpCode(totp, secret)) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }

    await this.audit.log({
      eventName: 'auth.admin.mfa.challenge_succeeded',
      action: AuditAction.APPROVE,
      entityType: 'AdminMfaCredential',
      entityId: userId,
      actorUserId: userId,
      actorRole: UserRole.ADMIN,
      note: 'Admin MFA challenge passed',
    });

    return user;
  }

  /** Consume a single-use recovery code; returns admin user for session issuance. */
  async recover(
    mfaToken: string,
    recoveryCode: string,
  ): Promise<AdminUserForSession> {
    const { sub: userId } = this.verifyMfaToken(
      mfaToken,
      MFA_TOKEN_PURPOSE_CHALLENGE,
    );
    const user = await this.requireActiveAdmin(userId);

    const enabled = await this.isEnabled(userId);
    if (!enabled) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }

    const codeHash = hashRecoveryCode(recoveryCode);
    const now = new Date();

    const consumed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.adminMfaRecoveryCode.updateMany({
        where: { userId, codeHash, usedAt: null },
        data: { usedAt: now },
      });
      if (updated.count !== 1) {
        return false;
      }
      await this.audit.log(
        {
          eventName: 'auth.admin.mfa.recovery_used',
          action: AuditAction.APPROVE,
          entityType: 'AdminMfaRecoveryCode',
          entityId: userId,
          actorUserId: userId,
          actorRole: UserRole.ADMIN,
          note: 'Admin MFA recovery code consumed',
          source: AuditSource.ADMIN_API,
        },
        tx,
      );
      return true;
    });

    if (!consumed) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }

    return user;
  }

  /**
   * Admin-initiated MFA reset: wipe credential + recovery codes and revoke
   * all live sessions for the target admin user.
   */
  async resetMfaForUser(
    actorUserId: string,
    actorRole: UserRole,
    targetUserId: string,
  ): Promise<{ reset: true }> {
    const target = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        status: { not: UserStatus.DELETED },
        role: UserRole.ADMIN,
      },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.adminMfaRecoveryCode.deleteMany({
        where: { userId: targetUserId },
      });
      await tx.adminMfaCredential.deleteMany({
        where: { userId: targetUserId },
      });
      await tx.authSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          eventName: 'admin.user.mfa_reset',
          action: AuditAction.UPDATE,
          entityType: 'User',
          entityId: targetUserId,
          actorUserId,
          actorRole,
          targetType: 'User',
          targetId: targetUserId,
          note: 'Admin MFA credential reset by another admin',
          source: AuditSource.ADMIN_API,
        },
        tx,
      );
    });

    return { reset: true };
  }

  private async loadEnabledSecret(userId: string): Promise<string> {
    const credential = await this.prisma.adminMfaCredential.findUnique({
      where: { userId },
    });
    if (
      !credential?.enabledAt ||
      !credential.secretCiphertext ||
      !credential.secretNonce
    ) {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }
    try {
      return decryptTotpSecret(
        credential.secretCiphertext,
        credential.secretNonce,
        this.getKey(),
      );
    } catch {
      throw new UnauthorizedException(GENERIC_MFA_UNAUTHORIZED);
    }
  }
}
