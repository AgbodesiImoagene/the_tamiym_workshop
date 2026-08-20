import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, UserStatus } from '../../generated/prisma/client';
import { AuthSurface } from '../../generated/prisma/enums';
import { resolveSurfaceFromOrigin } from '../auth-surface';
import { surfaceCookieNames } from '../auth-cookies';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  /** Auth surface (TTW-020) this access token was issued for. */
  surface: AuthSurface;
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
      },
    });

    if (!user || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('User not found');
    }

    // Bearer-token requests are explicit and surface-agnostic by design
    // (e.g. server-to-server or mobile clients with no browser cookie jar).
    // Cookie-authenticated requests must have a JWT surface claim matching
    // the surface implied by this request's Origin — this is what stops a
    // stolen/leaked admin cookie from authenticating on the customer origin
    // (or vice versa) even if it were somehow presented there.
    if (!hasBearerAuthorizationHeader(req)) {
      const requestSurface = resolveSurfaceFromOrigin(req);
      if (!requestSurface || payload.surface !== requestSurface) {
        throw new UnauthorizedException('Session surface mismatch');
      }
    }

    return { ...user, surface: payload.surface };
  }
}
