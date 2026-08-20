import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as crypto from 'node:crypto';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { authCookieBaseOptions, setSurfaceAuthCookies } from './auth-cookies';
import { AuthSurface } from '../generated/prisma/enums';
import {
  GOOGLE_OAUTH_NEXT_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  GOOGLE_OAUTH_COOKIE_MAX_AGE_MS,
} from '../constants';

@ApiTags('Auth')
@Controller('auth')
export class GoogleOAuthController {
  private readonly logger = new Logger(GoogleOAuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Start Google OAuth (redirect to Google)' })
  googleStart(
    @Query('next') next: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    if (!this.googleOAuth.isConfigured()) {
      const base = this.loginBaseUrl();
      return res.redirect(
        302,
        `${base}/auth/login?error=${encodeURIComponent('google_unavailable')}`,
      );
    }

    const state = crypto.randomBytes(32).toString('hex');
    const nextPath = this.sanitizeNextCookieValue(next);
    const cookieOpts = {
      ...authCookieBaseOptions(),
      maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE_MS,
    };

    res.cookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, state, cookieOpts);
    res.cookie(GOOGLE_OAUTH_NEXT_COOKIE_NAME, nextPath, cookieOpts);
    const url = this.googleOAuth.buildAuthorizeUrl(state);
    return res.redirect(302, url);
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Req() req: Request,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const targetBase = this.loginBaseUrl();
    const clearOauthCookies = () => {
      const z = { ...authCookieBaseOptions(), maxAge: 0 };
      res.cookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, '', z);
      res.cookie(GOOGLE_OAUTH_NEXT_COOKIE_NAME, '', z);
    };

    if (!this.googleOAuth.isConfigured()) {
      clearOauthCookies();
      return res.redirect(
        302,
        `${targetBase}/auth/login?error=${encodeURIComponent('google_unavailable')}`,
      );
    }

    if (oauthError) {
      clearOauthCookies();
      this.logger.warn(`Google OAuth error param: ${oauthError}`);
      return res.redirect(
        302,
        `${targetBase}/auth/login?error=${encodeURIComponent('google_denied')}`,
      );
    }

    const stateCookie = req.cookies?.[GOOGLE_OAUTH_STATE_COOKIE_NAME] as
      | string
      | undefined;
    const nextCookie = req.cookies?.[GOOGLE_OAUTH_NEXT_COOKIE_NAME] as
      | string
      | undefined;

    const stateBuf = state ? Buffer.from(state, 'utf8') : null;
    const cookieBuf = stateCookie ? Buffer.from(stateCookie, 'utf8') : null;
    const stateOk =
      !!code &&
      !!stateBuf &&
      !!cookieBuf &&
      stateBuf.length >= 8 &&
      stateBuf.length === cookieBuf.length &&
      crypto.timingSafeEqual(stateBuf, cookieBuf);

    if (!stateOk) {
      clearOauthCookies();
      return res.redirect(
        302,
        `${targetBase}/auth/login?error=${encodeURIComponent('google_state')}`,
      );
    }

    clearOauthCookies();

    try {
      const profile = await this.googleOAuth.exchangeCodeForProfile(code);
      const rawUa = req.headers['user-agent'];
      const userAgent =
        typeof rawUa === 'string'
          ? rawUa
          : Array.isArray(rawUa)
            ? rawUa[0]
            : undefined;
      const session = await this.authService.loginWithGoogleProfile(profile, {
        deviceLabel: this.authService.deviceLabelFromUserAgent(userAgent),
      });
      // Google sign-in is CUSTOMER-surface only (TTW-020); AuthService
      // rejects ADMIN-role accounts before this point.
      setSurfaceAuthCookies(
        res,
        AuthSurface.CUSTOMER,
        session.access_token,
        session.refresh_token,
      );
      const redirectTo = this.resolvePostLoginRedirect(nextCookie);
      return res.redirect(302, redirectTo);
    } catch (err) {
      this.logger.warn(
        `Google OAuth callback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return res.redirect(
        302,
        `${targetBase}/auth/login?error=${encodeURIComponent('google_failed')}`,
      );
    }
  }

  private loginBaseUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private allowedFrontendOrigins(): Set<string> {
    const set = new Set<string>();
    const fe =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    try {
      set.add(new URL(fe).origin);
    } catch {
      /* ignore */
    }
    const cors = this.config.get<string>('CORS_ORIGIN');
    if (cors) {
      for (const part of cors.split(',')) {
        const t = part.trim();
        if (!t) continue;
        try {
          set.add(new URL(t).origin);
        } catch {
          /* ignore */
        }
      }
    }
    return set;
  }

  /**
   * Store only a safe path or empty string in a cookie (max length capped).
   */
  private sanitizeNextCookieValue(next: string | undefined): string {
    const allowed = this.allowedFrontendOrigins();
    const defaultPath = '/dashboard';

    if (!next?.trim()) {
      return defaultPath;
    }
    const raw = next.trim().slice(0, 512);
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      return raw;
    }
    try {
      const u = new URL(raw);
      if (allowed.has(u.origin)) {
        return `${u.pathname}${u.search}${u.hash}` || defaultPath;
      }
    } catch {
      /* ignore */
    }
    return defaultPath;
  }

  private resolvePostLoginRedirect(nextCookie: string | undefined): string {
    const base = this.loginBaseUrl();
    const defaultUrl = `${base}/dashboard`;
    const allowed = this.allowedFrontendOrigins();

    if (!nextCookie?.trim()) {
      return defaultUrl;
    }
    const raw = nextCookie.trim().slice(0, 2048);
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      return `${base}${raw}`;
    }
    try {
      const u = new URL(raw);
      if (allowed.has(u.origin)) {
        return u.toString();
      }
    } catch {
      /* ignore */
    }
    return defaultUrl;
  }
}
