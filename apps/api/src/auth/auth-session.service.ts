import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type AuthSession } from '../generated/prisma/client';
import { AuthSurface } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { REFRESH_TOKEN_TTL_MS } from '../constants';
import {
  deviceLabelFromUserAgent,
  hashRefreshToken,
  mintRefreshToken,
} from './auth-session.crypto';

export type SessionListItem = {
  id: string;
  authSurface: AuthSurface;
  deviceLabel: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  current: boolean;
};

type Tx = Prisma.TransactionClient;

/**
 * Audience-bound hashed refresh sessions (TTW-023).
 * Plaintext refresh credentials are minted once and never persisted.
 */
@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a session for `surface`, revoking other-surface sessions for the user.
   * @returns plaintext refresh token (caller issues cookies / response body)
   */
  async createSession(
    userId: string,
    surface: AuthSurface,
    opts: { deviceLabel?: string | null; tx?: Tx } = {},
  ): Promise<{ session: AuthSession; refreshToken: string }> {
    const refreshToken = mintRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const deviceLabel = opts.deviceLabel ?? null;

    const run = async (tx: Tx) => {
      await tx.authSession.updateMany({
        where: {
          userId,
          revokedAt: null,
          OR: [{ authSurface: { not: surface } }],
        },
        data: { revokedAt: new Date() },
      });
      const session = await tx.authSession.create({
        data: {
          userId,
          authSurface: surface,
          refreshTokenHash,
          deviceLabel,
          expiresAt,
        },
      });
      return session;
    };

    const session = opts.tx
      ? await run(opts.tx)
      : await this.prisma.$transaction(run);
    return { session, refreshToken };
  }

  /**
   * Look up a live session by plaintext refresh token.
   * @throws UnauthorizedException when missing/expired/revoked
   */
  async requireLiveSessionByRefreshToken(
    refreshToken: string,
  ): Promise<AuthSession & { userId: string }> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      if (session && !session.revokedAt) {
        await this.prisma.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return session;
  }

  /**
   * Rotate refresh credential for a live session (optimistic concurrency on hash).
   * Concurrent refresh with the same token: only one updateMany wins.
   */
  async rotateSession(
    session: AuthSession,
    surface: AuthSurface,
    opts: { tx?: Tx } = {},
  ): Promise<{ session: AuthSession; refreshToken: string }> {
    const refreshToken = mintRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const now = new Date();

    const run = async (tx: Tx) => {
      // Revoke sibling sessions on other surfaces.
      await tx.authSession.updateMany({
        where: {
          userId: session.userId,
          id: { not: session.id },
          revokedAt: null,
          authSurface: { not: surface },
        },
        data: { revokedAt: now },
      });

      const updated = await tx.authSession.updateMany({
        where: {
          id: session.id,
          refreshTokenHash: session.refreshTokenHash,
          revokedAt: null,
        },
        data: {
          refreshTokenHash,
          authSurface: surface,
          expiresAt,
          lastSeenAt: now,
        },
      });
      if (updated.count !== 1) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      const next = await tx.authSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      return next;
    };

    const next = opts.tx
      ? await run(opts.tx)
      : await this.prisma.$transaction(run);
    return { session: next, refreshToken };
  }

  async revokeByRefreshToken(
    refreshToken: string,
    surface: AuthSurface,
  ): Promise<{ userId: string } | null> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash },
    });
    if (!session || session.revokedAt) return null;
    if (session.authSurface !== surface) return null;

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return { userId: session.userId };
  }

  async revokeAllForUser(userId: string, tx?: Tx): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeOneForUser(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new ForbiddenException('Session not found');
    }
  }

  async listForUser(
    userId: string,
    currentSessionId: string | undefined,
  ): Promise<SessionListItem[]> {
    const rows = await this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        authSurface: true,
        deviceLabel: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      current: currentSessionId === row.id,
    }));
  }

  /**
   * Access-JWT gate: session must be live and match the claim surface.
   */
  async assertAccessSession(
    sessionId: string,
    userId: string,
    surface: AuthSurface,
  ): Promise<void> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        authSurface: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (
      !session ||
      session.userId !== userId ||
      session.authSurface !== surface ||
      session.revokedAt ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('User not found');
    }
  }

  parseDeviceLabel(userAgent: string | undefined): string | null {
    return deviceLabelFromUserAgent(userAgent);
  }
}
