import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
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
    };
    const email = typeof body.email === 'string' ? body.email : null;
    const identityFromMfa = this.identityFromMfaToken(
      typeof body.mfa_token === 'string' ? body.mfa_token : null,
    );
    const path = req.path ?? '';
    const surface =
      path.includes('/admin') || path.includes('/auth/admin')
        ? 'ADMIN'
        : 'CUSTOMER';

    await this.rateLimit.consume({
      bucket,
      email,
      identity: identityFromMfa,
      ip: req.ip,
      surface,
    });
    return true;
  }

  /** Decode MFA JWT `sub` for identity key without treating decode failures as auth oracles. */
  private identityFromMfaToken(token: string | null): string | null {
    if (!token) return null;
    try {
      const payload = this.jwt.decode(token) as { sub?: unknown } | null;
      if (
        payload &&
        typeof payload.sub === 'string' &&
        payload.sub.length > 0
      ) {
        return `user:${payload.sub}`;
      }
    } catch {
      // fall through
    }
    return null;
  }
}
