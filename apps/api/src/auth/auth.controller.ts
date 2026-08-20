import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiCookieAuth,
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
  surfaceCookieNames,
} from './auth-cookies';
import { resolveSurfaceFromOrigin } from './auth-surface';

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
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() registerDto: RegisterDto,
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
    );

    setSurfaceAuthCookies(
      res,
      AuthSurface.CUSTOMER,
      loginResult.access_token,
      loginResult.refresh_token,
    );

    return {
      user: loginResult.user,
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
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials, or role not permitted on this surface',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto, AuthSurface.CUSTOMER);

    setSurfaceAuthCookies(
      res,
      AuthSurface.CUSTOMER,
      result.access_token,
      result.refresh_token,
    );

    return {
      user: result.user,
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
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials, or role not permitted on this surface',
  })
  async adminLogin(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto, AuthSurface.ADMIN);

    setSurfaceAuthCookies(
      res,
      AuthSurface.ADMIN,
      result.access_token,
      result.refresh_token,
    );

    return {
      user: result.user,
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
  @ApiOperation({ summary: 'Refresh access token' })
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
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Surface is server-derived from Origin/Referer (never a client body
    // field). Non-browser callers with no resolvable Origin default to
    // CUSTOMER — genuine admin-app browser requests always send Origin.
    const surface = resolveSurfaceFromOrigin(req) ?? AuthSurface.CUSTOMER;
    const refreshCookieName = surfaceCookieNames(surface).refresh;
    const refreshToken =
      (req?.cookies?.[refreshCookieName] as string | undefined) ??
      (req?.body && typeof req.body === 'object' && 'refresh_token' in req.body
        ? (req.body as { refresh_token?: string }).refresh_token
        : undefined);
    const result = await this.authService.refresh(refreshToken ?? '', surface);

    setSurfaceAuthCookies(
      res,
      surface,
      result.access_token,
      result.refresh_token,
    );

    return { user: result.user };
  }

  /**
   * Logout: invalidate refresh token and clear auth cookies
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear auth cookies' })
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
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const surface = resolveSurfaceFromOrigin(req) ?? AuthSurface.CUSTOMER;
    const refreshCookieName = surfaceCookieNames(surface).refresh;
    const refreshToken =
      (req?.cookies?.[refreshCookieName] as string | undefined) ??
      (req?.body && typeof req.body === 'object' && 'refresh_token' in req.body
        ? (req.body as { refresh_token?: string }).refresh_token
        : undefined);
    await this.authService.logout(refreshToken);
    clearSurfaceAuthCookies(res, surface);
    clearLegacyAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  /**
   * Get current authenticated user
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user' })
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
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@CurrentUser() user: RequestUser) {
    return user;
  }
}
