import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, UserStatus } from '../../generated/prisma/client';
import { AuthSurface } from '../../generated/prisma/enums';
import {
  isRoleAllowedForSurface,
  resolveSurfaceFromOrigin,
} from '../auth-surface';
import { surfaceCookieNames } from '../auth-cookies';
import { AccountPolicyService } from '../account-policy.service';
import { AuthSessionService } from '../auth-session.service';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  /** Auth surface (TTW-020) this access token was issued for. */
  surface: AuthSurface;
  /** AuthSession id — access JWTs are bound to a live hashed refresh session. */
  sid: string;
}

/** Shape of the user attached to the request by JWT strategy (validate return value). */
export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** Surface this request authenticated on (from the validated JWT). */
  surface: AuthSurface;
  /** Live AuthSession id from the access JWT `sid` claim. */
  sessionId: string;
}

/** True when `value` is one of the known auth surfaces (never trust a raw claim). */
function isKnownSurface(value: unknown): value is AuthSurface {
  return (
    typeof value === 'string' &&
    (Object.values(AuthSurface) as string[]).includes(value)
  );
}

/** True when the request carries an explicit `Authorization: Bearer` header. */
function hasBearerAuthorizationHeader(request: Request): boolean {
  const header = request.headers?.authorization;
  return typeof header === 'string' && /^Bearer\s+\S+/i.test(header);
}

/**
 * Cookie-based JWT extractor: only reads the access cookie belonging to the
 * surface implied by the request's Origin/Referer. A customer-surface cookie
 * is never read on an admin-origin request, and vice versa — this is the
 * server-side enforcement point that prevents cross-surface cookie reuse at
 * extraction time (defense in depth alongside the `validate` surface check).
 */
function extractAccessTokenFromSurfaceCookie(request: Request): string | null {
  const surface = resolveSurfaceFromOrigin(request);
  if (!surface) return null;
  const names = surfaceCookieNames(surface);
  const token = request?.cookies?.[names.access] as string | undefined;
  return token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private accountPolicy: AccountPolicyService,
    private authSession: AuthSessionService,
  ) {
    super({
      passReqToCallback: true,
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractAccessTokenFromSurfaceCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: (() => {
        const secret = configService.get<string>('JWT_ACCESS_SECRET');
        if (!secret || secret === 'secret') {
          throw new Error(
            'JWT_ACCESS_SECRET must be set and must not be the default placeholder',
          );
        }
        return secret;
      })(),
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        firstName: true,
        lastName: true,
        phone: true,
        emailVerifiedAt: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User not found');
    }

    if (this.accountPolicy.isPrivilegedRoleUnverified(user)) {
      throw new UnauthorizedException('User not found');
    }

    // Every access token must name the surface it was minted for, and the
    // account's *current* role must still be permitted on that surface. This
    // is enforced for bearer tokens too: without it, a session minted on the
    // customer surface would keep working after the account was promoted to
    // ADMIN, and an admin-surface bearer token would be usable by an account
    // that has since been demoted (TTW-020 review fix).
    if (!isKnownSurface(payload.surface)) {
      throw new UnauthorizedException('Session surface missing');
    }
    if (!isRoleAllowedForSurface(user.role, payload.surface)) {
      throw new UnauthorizedException(
        'Role is not permitted on this session surface',
      );
    }

    if (typeof payload.sid !== 'string' || payload.sid.length === 0) {
      throw new UnauthorizedException('User not found');
    }
    await this.authSession.assertAccessSession(
      payload.sid,
      user.id,
      payload.surface,
    );

    // Cookie-authenticated requests must additionally have a JWT surface
    // claim matching the surface implied by this request's Origin — this is
    // what stops a stolen/leaked admin cookie from authenticating on the
    // customer origin (or vice versa) even if it were somehow presented
    // there. Bearer callers have no ambient cookie jar and no Origin, so the
    // role×surface check above is their surface gate.
    if (!hasBearerAuthorizationHeader(req)) {
      const requestSurface = resolveSurfaceFromOrigin(req);
      if (!requestSurface || payload.surface !== requestSurface) {
        throw new UnauthorizedException('Session surface mismatch');
      }
    }

    const { emailVerifiedAt: _verified, ...safeUser } = user;
    void _verified;
    return {
      ...safeUser,
      surface: payload.surface,
      sessionId: payload.sid,
    };
  }
}
