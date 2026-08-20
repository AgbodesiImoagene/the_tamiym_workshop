import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { AuthSurface } from '../../generated/prisma/enums';
import type { AuthRateLimitBucket } from '../../constants';
import {
  MFA_TOKEN_PURPOSE_CHALLENGE,
  MFA_TOKEN_PURPOSE_ENROLL,
} from '../admin-mfa.service';
import { AUTH_RATE_LIMIT_BUCKET_KEY } from '../auth-rate-limit';
import { AuthRateLimitService } from '../auth-rate-limit.service';

const MFA_TOKEN_PURPOSES = new Set([
  MFA_TOKEN_PURPOSE_ENROLL,
  MFA_TOKEN_PURPOSE_CHALLENGE,
]);

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: AuthRateLimitService,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bucket = this.reflector.getAllAndOverride<
      AuthRateLimitBucket | undefined
    >(AUTH_RATE_LIMIT_BUCKET_KEY, [context.getHandler(), context.getClass()]);
    if (!bucket) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const body = (req.body ?? {}) as {
      email?: unknown;
      mfa_token?: unknown;
      token?: unknown;
    };
    const email = typeof body.email === 'string' ? body.email : null;
    const identity =
      this.identityFromMfaToken(
        typeof body.mfa_token === 'string' ? body.mfa_token : null,
      ) ??
      this.identityFromResetToken(
        typeof body.token === 'string' ? body.token : null,
      );
    const path = req.path ?? '';
    const surface =
      path.includes('/admin') || path.includes('/auth/admin')
        ? 'ADMIN'
        : 'CUSTOMER';

    await this.rateLimit.consume({
      bucket,
      email,
      identity,
      ip: req.ip,
      surface,
    });
    return true;
  }

  /**
   * Verify MFA JWT signature + purpose/surface before using `sub` as an
   * identity key. Access JWTs share the signing secret but must not burn
   * another admin's MFA counters. Forged/mismatched tokens fingerprint only.
   */
  private identityFromMfaToken(token: string | null): string | null {
    if (!token) return null;
    const fingerprint = `mfa:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
    try {
      const payload = this.jwt.verify<{
        sub?: unknown;
        purpose?: unknown;
        surface?: unknown;
      }>(token, {
        ignoreExpiration: true,
      });
      if (
        typeof payload.sub === 'string' &&
        payload.sub.length > 0 &&
        typeof payload.purpose === 'string' &&
        MFA_TOKEN_PURPOSES.has(payload.purpose as never) &&
        payload.surface === AuthSurface.ADMIN
      ) {
        return `user:${payload.sub}`;
      }
    } catch {
      // fall through to token fingerprint
    }
    return fingerprint;
  }

  /** Hash password-reset tokens so resets do not share a global `anon` key. */
  private identityFromResetToken(token: string | null): string | null {
    if (!token || token.trim().length === 0) return null;
    return `reset:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  }
}
