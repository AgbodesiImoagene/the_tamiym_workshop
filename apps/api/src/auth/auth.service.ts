import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  UserRole,
  UserStatus,
  TokenType,
  OAuthProvider,
} from '../generated/prisma/client';
import { AuditAction, AuthSurface } from '../generated/prisma/enums';
import { JwtPayload } from './strategies/jwt.strategy';
import { isRoleAllowedForSurface } from './auth-surface';
import {
  MAIL_QUEUE_NAME,
  JOB_VERIFICATION_EMAIL,
  JOB_PASSWORD_RESET_EMAIL,
  VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '../constants';
import { ObservabilityService } from '../observability/observability.service';
import { AccountPolicyService } from './account-policy.service';
import {
  AuthSessionService,
  type SessionListItem,
} from './auth-session.service';

/** Normalized Google userinfo / id_token claims used to sign in or link accounts. */
export type GoogleOAuthProfile = {
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
};

export type LoginSessionOptions = {
  deviceLabel?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private observability: ObservabilityService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private accountPolicy: AccountPolicyService,
    private authSession: AuthSessionService,
    @InjectQueue(MAIL_QUEUE_NAME) private mailQueue: Queue,
  ) {}

  /**
   * Register a new user
   * @param registerDto Registration data
   * @returns User object without password
   * @throws ConflictException if email already exists
   */
  async register(registerDto: RegisterDto) {
    // Normalise email to lower-case to prevent duplicate accounts
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email.toLowerCase().trim() },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email.toLowerCase().trim(),
        passwordHash: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone ?? null,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    });

    await this.enqueueVerificationEmail(user.id, user.email);
    return user;
  }

  /**
   * Verify email using token from verification link.
   * @throws BadRequestException if token invalid or expired
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    const record = await this.prisma.authToken.findFirst({
      where: { token, tokenType: TokenType.EMAIL_VERIFICATION },
      include: { user: { select: { id: true, role: true } } },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.authToken.delete({ where: { id: record.id } });
      throw new BadRequestException('Invalid or expired verification token');
    }

    const verifiedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: verifiedAt },
      });
      await tx.authToken.delete({ where: { id: record.id } });
      await this.audit.log(
        {
          eventName: 'auth.email.verified',
          action: AuditAction.APPROVE,
          entityType: 'User',
          entityId: record.userId,
          actorUserId: record.userId,
          actorRole: record.user.role,
          after: { emailVerifiedAt: verifiedAt },
          note: 'User verified email address',
        },
        tx,
      );
    });

    return { message: 'Email verified successfully' };
  }

  /**
   * Resend verification email. Always returns success to avoid leaking account existence.
   */
  async resendVerification(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, status: { not: UserStatus.DELETED } },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (user && !user.emailVerifiedAt) {
      await this.enqueueVerificationEmail(user.id, user.email);
    }

    return {
      message:
        'If an account exists with this email, a verification link has been sent',
    };
  }

  /**
   * Request password reset. Sends reset link to email if user exists. Always returns success.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, status: { not: UserStatus.DELETED } },
      select: { id: true, email: true },
    });

    if (user) {
      // Revoke any prior unexpired reset tokens before issuing a new one
      await this.prisma.authToken.deleteMany({
        where: { userId: user.id, tokenType: TokenType.PASSWORD_RESET },
      });
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
      await this.prisma.authToken.create({
        data: {
          userId: user.id,
          token,
          tokenType: TokenType.PASSWORD_RESET,
          expiresAt,
        },
      });
      const baseUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await this.mailQueue.add(JOB_PASSWORD_RESET_EMAIL, {
        to: user.email,
        resetUrl,
      });
    }

    return {
      message:
        'If an account exists with this email, a password reset link has been sent',
    };
  }

  /**
   * Reset password using token from reset link.
   * @throws BadRequestException if token invalid or expired
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const record = await this.prisma.authToken.findFirst({
      where: { token, tokenType: TokenType.PASSWORD_RESET },
      include: { user: { select: { id: true, role: true } } },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.authToken.delete({ where: { id: record.id } });
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.authToken.delete({ where: { id: record.id } });
      // Close all hashed sessions after password recovery (TTW-023).
      await this.authSession.revokeAllForUser(record.userId, tx);
      // Safety: clear any leftover legacy plaintext REFRESH rows.
      await tx.authToken.deleteMany({
        where: { userId: record.userId, tokenType: TokenType.REFRESH },
      });
      await this.audit.log(
        {
          eventName: 'auth.password.reset',
          action: AuditAction.UPDATE,
          entityType: 'User',
          entityId: record.userId,
          actorUserId: record.userId,
          actorRole: record.user.role,
          note: 'User reset password via recovery flow — all sessions revoked',
        },
        tx,
      );
    });

    return { message: 'Password has been reset successfully' };
  }

  /**
   * Change password for authenticated user (requires current password).
   * @throws BadRequestException if current password is wrong
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses Google sign-in. Use password reset to set a password first.',
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      await this.authSession.revokeAllForUser(userId, tx);
      await tx.authToken.deleteMany({
        where: { userId, tokenType: TokenType.REFRESH },
      });
      await this.audit.log(
        {
          eventName: 'auth.password.changed',
          action: AuditAction.UPDATE,
          entityType: 'User',
          entityId: userId,
          actorUserId: userId,
          note: 'Authenticated user changed password — all sessions revoked',
        },
        tx,
      );
    });

    return { message: 'Password has been changed successfully' };
  }

  private async createVerificationToken(userId: string): Promise<string> {
    // Revoke any prior unexpired verification tokens before creating a new one
    await this.prisma.authToken.deleteMany({
      where: { userId, tokenType: TokenType.EMAIL_VERIFICATION },
    });
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.prisma.authToken.create({
      data: {
        userId,
        token,
        tokenType: TokenType.EMAIL_VERIFICATION,
        expiresAt,
      },
    });
    return token;
  }

  private async enqueueVerificationEmail(
    userId: string,
    email: string,
  ): Promise<void> {
    const token = await this.createVerificationToken(userId);
    const baseUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.mailQueue.add(JOB_VERIFICATION_EMAIL, {
      to: email,
      token,
      verifyUrl,
    });
  }

  /**
   * Authenticate user and return access + refresh tokens and user data.
   *
   * `surface` is always server-derived (route path for login endpoints) —
   * never a client-supplied field. Only roles permitted on `surface` may
   * authenticate (TTW-020 role×surface invariant); e.g. an ADMIN cannot log
   * in via `POST /auth/login` and a CUSTOMER cannot log in via
   * `POST /auth/admin/login`.
   *
   * @param loginDto Login credentials
   * @param surface Auth surface this login is for (CUSTOMER or ADMIN)
   * @returns Access token, refresh token, and user data
   */
  async login(
    loginDto: LoginDto,
    surface: AuthSurface,
    opts: LoginSessionOptions = {},
  ) {
    // Normalize email consistently with register/Google to prevent
    // case-sensitivity account-lookup mismatches.
    const email = loginDto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.status === UserStatus.DELETED) {
      this.observability.recordAuthLogin({ outcome: 'failure' });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Block any non-ACTIVE status (suspended, pending review, etc.)
    if (user.status !== UserStatus.ACTIVE) {
      this.observability.recordAuthLogin({ outcome: 'failure' });
      throw new UnauthorizedException('Account is not active');
    }

    if (!user.passwordHash) {
      this.observability.recordAuthLogin({ outcome: 'failure' });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      this.observability.recordAuthLogin({ outcome: 'failure' });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!isRoleAllowedForSurface(user.role, surface)) {
      // Credentials were valid but this role may not authenticate on this
      // surface (e.g. admin credentials on the customer login) — record as
      // "denied" (distinct from bad-credentials "failure") for audit/metrics.
      this.observability.recordAuthLogin({ outcome: 'denied' });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.accountPolicy.isPrivilegedRoleUnverified(user)) {
      this.observability.recordAuthLogin({ outcome: 'denied' });
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.completeLoginSession(
      user,
      'User authenticated successfully',
      surface,
      opts,
    );
  }

  /**
   * Sign in or register via Google OAuth (account linking by verified email).
   */
  async loginWithGoogleProfile(
    profile: GoogleOAuthProfile,
    opts: LoginSessionOptions = {},
  ) {
    const email = profile.email.toLowerCase().trim();
    if (!email || !profile.providerAccountId) {
      this.observability.recordAuthLogin({ outcome: 'failure' });
      throw new BadRequestException('Invalid Google profile');
    }

    const linked = await this.prisma.userOAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: OAuthProvider.GOOGLE,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    let user = linked?.user;

    if (user?.status === UserStatus.DELETED) {
      this.observability.recordAuthLogin({ outcome: 'failure' });
      throw new UnauthorizedException('Account is unavailable');
    }

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingByEmail) {
        if (existingByEmail.status === UserStatus.DELETED) {
          this.observability.recordAuthLogin({ outcome: 'failure' });
          throw new UnauthorizedException('Account is unavailable');
        }
        await this.prisma.userOAuthAccount.create({
          data: {
            provider: OAuthProvider.GOOGLE,
            providerAccountId: profile.providerAccountId,
            userId: existingByEmail.id,
          },
        });
        user = await this.prisma.user.findUniqueOrThrow({
          where: { id: existingByEmail.id },
        });
      } else {
        const firstName = profile.firstName?.trim() || 'Customer';
        const lastName = profile.lastName?.trim() || 'User';

        user = await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email,
              passwordHash: null,
              firstName,
              lastName,
              phone: null,
              role: UserRole.CUSTOMER,
              status: UserStatus.ACTIVE,
              emailVerifiedAt: profile.emailVerified ? new Date() : null,
            },
          });
          await tx.userOAuthAccount.create({
            data: {
              provider: OAuthProvider.GOOGLE,
              providerAccountId: profile.providerAccountId,
              userId: created.id,
            },
          });
          return created;
        });
      }
    }

    const updates: {
      emailVerifiedAt?: Date;
      firstName?: string;
      lastName?: string;
    } = {};

    if (profile.emailVerified && !user.emailVerifiedAt) {
      updates.emailVerifiedAt = new Date();
    }
    if (
      profile.firstName?.trim() &&
      (user.firstName === 'Customer' || !user.firstName.trim())
    ) {
      updates.firstName = profile.firstName.trim();
    }
    if (
      profile.lastName?.trim() &&
      (user.lastName === 'User' || !user.lastName.trim())
    ) {
      updates.lastName = profile.lastName.trim();
    }

    if (Object.keys(updates).length > 0) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: updates,
      });
    }

    // Google sign-in is a CUSTOMER-surface-only flow (TTW-020): admin
    // accounts must never be reachable via the public OAuth callback.
    if (!isRoleAllowedForSurface(user.role, AuthSurface.CUSTOMER)) {
      this.observability.recordAuthLogin({ outcome: 'denied' });
      throw new UnauthorizedException(
        'This account cannot sign in with Google',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      this.observability.recordAuthLogin({ outcome: 'failure' });
      throw new UnauthorizedException('Account is not active');
    }
    if (this.accountPolicy.isPrivilegedRoleUnverified(user)) {
      this.observability.recordAuthLogin({ outcome: 'denied' });
      throw new UnauthorizedException(
        'This account cannot sign in with Google',
      );
    }

    return this.completeLoginSession(
      user,
      'User authenticated via Google',
      AuthSurface.CUSTOMER,
      opts,
    );
  }

  private async completeLoginSession(
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      phone: string | null;
      role: UserRole;
      status: UserStatus;
    },
    auditNote: string,
    surface: AuthSurface,
    opts: LoginSessionOptions = {},
  ) {
    const loggedInAt = new Date();
    let sessionId = '';
    let refreshToken = '';

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: loggedInAt },
      });
      // Named hashed session; createSession revokes other-surface sessions.
      const created = await this.authSession.createSession(user.id, surface, {
        deviceLabel: opts.deviceLabel,
        tx,
      });
      sessionId = created.session.id;
      refreshToken = created.refreshToken;
      // Safety: clear leftover legacy plaintext REFRESH rows.
      await tx.authToken.deleteMany({
        where: { userId: user.id, tokenType: TokenType.REFRESH },
      });
      await this.audit.log(
        {
          eventName: 'auth.login.succeeded',
          action: AuditAction.APPROVE,
          entityType: 'User',
          entityId: user.id,
          actorUserId: user.id,
          actorRole: user.role,
          after: {
            lastLoginAt: loggedInAt,
            authSurface: surface,
            sessionId,
          },
          note: auditNote,
        },
        tx,
      );
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      surface,
      sid: sessionId,
    };
    const accessToken = this.jwtService.sign(payload);
    this.observability.recordAuthLogin({ outcome: 'success' });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * Issue new access token (and rotate refresh token) using a valid refresh
   * token, scoped to `surface` (server-derived from request Origin — see
   * `resolveSurfaceFromOrigin`).
   *
   * Rejects when the session's stored `authSurface` or the user's role does
   * not match `surface`.
   *
   * @throws UnauthorizedException if refresh token missing, invalid, expired, or surface-mismatched
   */
  async refresh(refreshToken: string, surface: AuthSurface) {
    const session =
      await this.authSession.requireLiveSessionByRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
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

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.authSession
        .revokeOneForUser(session.userId, session.id)
        .catch(() => undefined);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (this.accountPolicy.isPrivilegedRoleUnverified(user)) {
      await this.authSession
        .revokeOneForUser(session.userId, session.id)
        .catch(() => undefined);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (
      session.authSurface !== surface ||
      !isRoleAllowedForSurface(user.role, surface)
    ) {
      this.observability.recordAuthLogin({ outcome: 'denied' });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const rotated = await this.authSession.rotateSession(session, surface);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      surface,
      sid: rotated.session.id,
    };
    const accessToken = this.jwtService.sign(payload);

    await this.audit.log({
      eventName: 'auth.session.refreshed',
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      actorRole: user.role,
      after: { authSurface: surface, sessionId: rotated.session.id },
      note: 'Refresh token rotated',
    });

    return {
      access_token: accessToken,
      refresh_token: rotated.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * Invalidate a refresh session (e.g. on logout), scoped to `surface`.
   *
   * No-op if the token is unknown, or if it belongs to a *different* surface:
   * a logout resolved for one surface must never revoke the other surface's
   * session (TTW-020 — that would be a cross-surface forced logout).
   */
  async logout(
    refreshToken: string | undefined,
    surface: AuthSurface,
  ): Promise<void> {
    if (!refreshToken) return;
    const revoked = await this.authSession.revokeByRefreshToken(
      refreshToken,
      surface,
    );
    if (!revoked) return;

    const user = await this.prisma.user.findUnique({
      where: { id: revoked.userId },
      select: { id: true, role: true },
    });
    if (!user) return;

    await this.audit.log({
      eventName: 'auth.logout',
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      actorRole: user.role,
      after: { authSurface: surface },
      note: 'Session revoked on logout',
    });
  }

  listSessions(
    userId: string,
    currentSessionId: string | undefined,
  ): Promise<SessionListItem[]> {
    return this.authSession.listForUser(userId, currentSessionId);
  }

  revokeSession(userId: string, sessionId: string): Promise<void> {
    return this.authSession.revokeOneForUser(userId, sessionId);
  }

  revokeAllSessions(userId: string): Promise<number> {
    return this.authSession.revokeAllForUser(userId);
  }

  /** Coarse device label from User-Agent for session metadata. */
  deviceLabelFromUserAgent(userAgent: string | undefined): string | null {
    return this.authSession.parseDeviceLabel(userAgent);
  }
}
