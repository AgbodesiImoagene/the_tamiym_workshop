import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { AuthRateLimitBucket } from '../../constants';
import { AUTH_RATE_LIMIT_BUCKET_KEY } from '../auth-rate-limit';
import { AuthRateLimitService } from '../auth-rate-limit.service';

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
   * Verify MFA JWT signature before using `sub` as an identity key.
   * Forged tokens must not burn another user's counters (ignoreExpiry so
   * expired challenges still share the same bucket while they are attempted).
   */
  private identityFromMfaToken(token: string | null): string | null {
    if (!token) return null;
    try {
      const payload = this.jwt.verify<{ sub?: unknown }>(token, {
        ignoreExpiration: true,
      });
      if (typeof payload.sub === 'string' && payload.sub.length > 0) {
        return `user:${payload.sub}`;
      }
    } catch {
      // fall through to token fingerprint
    }
    return `mfa:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  }

  /** Hash password-reset tokens so resets do not share a global `anon` key. */
  private identityFromResetToken(token: string | null): string | null {
    if (!token || token.trim().length === 0) return null;
    return `reset:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  }
}
