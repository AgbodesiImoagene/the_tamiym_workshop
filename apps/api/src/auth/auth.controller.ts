import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
  Get,
  Delete,
  Param,
  Headers,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt/jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { RequestUser } from './strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/client';
import { AuthSurface } from '../generated/prisma/enums';
import { THROTTLE_LIMIT, THROTTLE_TTL_MS } from '../constants';
import {
  setSurfaceAuthCookies,
  clearSurfaceAuthCookies,
  clearLegacyAuthCookies,
  ensureSurfaceCsrfCookie,
  surfaceCookieNames,
  surfacesWithSessionCookies,
} from './auth-cookies';
import { resolveSurfaceFromOrigin } from './auth-surface';

/**
 * Swagger schema for the `csrf_token` returned by every session-issuing
 * response. Frontends store it (sessionStorage) and echo it in
 * `X-CSRF-Token` on mutating requests — the CSRF cookie itself is host-only
 * on the API origin and therefore unreadable to a cross-origin SPA.
 */
const CSRF_TOKEN_SCHEMA = {
  type: 'string',
  description:
    'Double-submit CSRF token, also set as the surface CSRF cookie. Send it back in the X-CSRF-Token header on mutating requests.',
} as const;

/** `refresh_token` supplied in the request body by a non-browser client. */
function bodyRefreshToken(req: Request): string | undefined {
  if (!req?.body || typeof req.body !== 'object') return undefined;
  const token = (req.body as { refresh_token?: unknown }).refresh_token;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user account
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: THROTTLE_LIMIT, ttl: THROTTLE_TTL_MS } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            role: { type: 'string', enum: Object.values(UserRole) },
            status: { type: 'string', example: 'ACTIVE' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        csrf_token: CSRF_TOKEN_SCHEMA,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() registerDto: RegisterDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.register(registerDto);

    // Auto-login after registration (registration is always CUSTOMER surface).
    const loginResult = await this.authService.login(
      {
        email: registerDto.email,
        password: registerDto.password,
      },
      AuthSurface.CUSTOMER,
      { deviceLabel: this.authService.deviceLabelFromUserAgent(userAgent) },
    );

    const csrfToken = setSurfaceAuthCookies(
      res,
      AuthSurface.CUSTOMER,
      loginResult.access_token,
      loginResult.refresh_token,
    );

    return {
      user: loginResult.user,
      csrf_token: csrfToken,
    };
  }

  /**
   * Login with email and password (CUSTOMER surface — apps/app, apps/web).
   * ADMIN-role credentials are rejected here; use `POST /auth/admin/login`.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: THROTTLE_LIMIT, ttl: THROTTLE_TTL_MS } })
  @ApiOperation({ summary: 'Login with email and password (customer surface)' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            role: { type: 'string', enum: Object.values(UserRole) },
            status: { type: 'string', example: 'ACTIVE' },
          },
        },
        csrf_token: CSRF_TOKEN_SCHEMA,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials, or role not permitted on this surface',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      loginDto,
      AuthSurface.CUSTOMER,
      { deviceLabel: this.authService.deviceLabelFromUserAgent(userAgent) },
    );

    const csrfToken = setSurfaceAuthCookies(
      res,
      AuthSurface.CUSTOMER,
      result.access_token,
      result.refresh_token,
    );

    return {
      user: result.user,
      csrf_token: csrfToken,
    };
  }

  /**
   * Login with email and password (ADMIN surface — apps/admin only).
   * CUSTOMER/ORGANIZER-role credentials are rejected here (TTW-020).
   */
  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: THROTTLE_LIMIT, ttl: THROTTLE_TTL_MS } })
  @ApiOperation({ summary: 'Login with email and password (admin surface)' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated as an admin',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            role: { type: 'string', enum: [UserRole.ADMIN] },
            status: { type: 'string', example: 'ACTIVE' },
          },
        },
        csrf_token: CSRF_TOKEN_SCHEMA,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials, or role not permitted on this surface',
  })
  async adminLogin(
    @Body() loginDto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto, AuthSurface.ADMIN, {
      deviceLabel: this.authService.deviceLabelFromUserAgent(userAgent),
    });

    const csrfToken = setSurfaceAuthCookies(
      res,
      AuthSurface.ADMIN,
      result.access_token,
      result.refresh_token,
    );

    return {
      user: result.user,
      csrf_token: csrfToken,
    };
  }

  /**
   * Verify email using token from verification link
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Email verified successfully' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  /**
   * Resend verification email (rate-limited)
   */
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: THROTTLE_LIMIT, ttl: THROTTLE_TTL_MS } })
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({
    status: 200,
    description: 'If account exists, verification email sent',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example:
            'If an account exists with this email, a verification link has been sent',
        },
      },
    },
  })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  /**
   * Request password reset email (rate-limited)
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: THROTTLE_LIMIT, ttl: THROTTLE_TTL_MS } })
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'If account exists, reset email sent',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example:
            'If an account exists with this email, a password reset link has been sent',
        },
      },
    },
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /**
   * Reset password using token from email link
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Password has been reset successfully',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /**
   * Change password (authenticated user)
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Password has been changed successfully',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Current password incorrect' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * Refresh access token using refresh token (e.g. from cookie)
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Cookie sessions must send the surface CSRF header (X-CSRF-Token) and an allowlisted Origin; a body-only `refresh_token` call (no session cookies) is treated as a non-browser client and is CSRF-exempt.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access and refresh tokens issued',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            role: { type: 'string', enum: Object.values(UserRole) },
            status: { type: 'string', example: 'ACTIVE' },
          },
        },
        csrf_token: CSRF_TOKEN_SCHEMA,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({
    status: 403,
    description: 'Missing/invalid CSRF token or disallowed Origin',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const surface = this.resolveSessionSurface(req);
    if (!surface) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const refreshToken =
      (req?.cookies?.[surfaceCookieNames(surface).refresh] as
        | string
        | undefined) ?? bodyRefreshToken(req);
    const result = await this.authService.refresh(refreshToken ?? '', surface);

    const csrfToken = setSurfaceAuthCookies(
      res,
      surface,
      result.access_token,
      result.refresh_token,
    );

    return { user: result.user, csrf_token: csrfToken };
  }

  /**
   * Logout: invalidate refresh token and clear auth cookies
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout and clear auth cookies',
    description:
      'Revokes and clears only the resolved surface. Cookie sessions must send the surface CSRF header (X-CSRF-Token) and an allowlisted Origin.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully logged out',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Logged out successfully' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Session surface could not be resolved for the presented cookies',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing/invalid CSRF token or disallowed Origin',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const surface = this.resolveSessionSurface(req);

    // Nothing to revoke (no session cookies, no body token): stay idempotent
    // and only clear the legacy shared cookie names.
    if (!surface) {
      clearLegacyAuthCookies(res);
      return { message: 'Logged out successfully' };
    }

    const refreshToken =
      (req?.cookies?.[surfaceCookieNames(surface).refresh] as
        | string
        | undefined) ?? bodyRefreshToken(req);
    await this.authService.logout(refreshToken, surface);
    clearSurfaceAuthCookies(res, surface);
    clearLegacyAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  /**
   * Surface a cookie-scoped `refresh`/`logout` acts on.
   *
   * Origin (fallback Referer) is the only trusted surface signal for a
   * browser request, so a request that presents surface session cookies is
   * rejected — never silently defaulted to CUSTOMER (TTW-020 review fix) —
   * when the Origin is unknown or points at the other surface. Only a
   * cookie-less caller supplying `refresh_token` in the body (a non-browser
   * client) defaults to CUSTOMER. Returns `undefined` when the request
   * presents no credentials at all.
   *
   * @throws UnauthorizedException when cookies are present but the surface
   * cannot be trusted.
   */
  private resolveSessionSurface(req: Request): AuthSurface | undefined {
    const originSurface = resolveSurfaceFromOrigin(req);
    const cookieSurfaces = surfacesWithSessionCookies(req);

    if (originSurface) {
      if (
        cookieSurfaces.length > 0 &&
        !cookieSurfaces.includes(originSurface)
      ) {
        throw new UnauthorizedException('Session surface mismatch');
      }
      return originSurface;
    }

    if (cookieSurfaces.length > 0) {
      throw new UnauthorizedException(
        'Session surface could not be resolved from the request Origin',
      );
    }

    return bodyRefreshToken(req) ? AuthSurface.CUSTOMER : undefined;
  }

  /**
   * Get current authenticated user
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get current authenticated user',
    description:
      'Also returns the session CSRF token for cookie-authenticated callers, so a frontend that lost its in-memory copy (new tab, OAuth redirect) can recover it without rotating the session.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'Current user information',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
        role: { type: 'string', enum: Object.values(UserRole) },
        status: { type: 'string', example: 'ACTIVE' },
        surface: { type: 'string', enum: Object.values(AuthSurface) },
        sessionId: {
          type: 'string',
          description: 'Live AuthSession id bound to this access JWT',
        },
        csrf_token: {
          ...CSRF_TOKEN_SCHEMA,
          description: `${CSRF_TOKEN_SCHEMA.description} Absent for bearer-only callers, which hold no cookie session.`,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csrfToken = ensureSurfaceCsrfCookie(req, res, user.surface);
    return csrfToken ? { ...user, csrf_token: csrfToken } : { ...user };
  }

  /**
   * List live sessions for the authenticated user (no refresh credentials).
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List active auth sessions',
    description:
      'Returns live (non-revoked, non-expired) sessions for the current user. Does not include refresh tokens or hashes.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'Active sessions (metadata only)',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          authSurface: { type: 'string', enum: Object.values(AuthSurface) },
          deviceLabel: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          lastSeenAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          current: {
            type: 'boolean',
            description:
              'True when this row is the session for the present access JWT',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  listSessions(@CurrentUser() user: RequestUser) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  /**
   * Revoke a single session owned by the authenticated user.
   */
  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke one auth session' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'AuthSession id' })
  @ApiResponse({
    status: 200,
    description: 'Session revoked',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Session revoked' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Session not found for this user' })
  async revokeSession(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
  ) {
    await this.authService.revokeSession(user.id, sessionId);
    return { message: 'Session revoked' };
  }

  /**
   * Revoke all sessions for the authenticated user (sign out everywhere).
   */
  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke all auth sessions',
    description:
      'Revokes every live session for the user, including the current one. Access JWTs for revoked sessions fail on the next request.',
  })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'All sessions revoked',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'All sessions revoked' },
        revoked: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async revokeAllSessions(@CurrentUser() user: RequestUser) {
    const revoked = await this.authService.revokeAllSessions(user.id);
    return { message: 'All sessions revoked', revoked };
  }
}
