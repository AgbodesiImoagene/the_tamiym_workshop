import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt/jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { RequestUser } from './strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/client';

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

    // Auto-login after registration
    const loginResult = await this.authService.login({
      email: registerDto.email,
      password: registerDto.password,
    });

    // Set HTTP-only cookie
    this.setAuthCookie(res, loginResult.access_token);

    return {
      user: loginResult.user,
    };
  }

  /**
   * Login with email and password
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
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
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);

    // Set HTTP-only cookie
    this.setAuthCookie(res, result.access_token);

    return {
      user: result.user,
    };
  }

  /**
   * Logout (clears authentication cookie)
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear authentication cookie' })
  @ApiBearerAuth('JWT-auth')
  @ApiCookieAuth('access_token')
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
  logout(@Res({ passthrough: true }) res: Response) {
    this.clearAuthCookie(res);
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

  /**
   * Helper method to set authentication cookie
   */
  private setAuthCookie(res: Response, token: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    const maxAge = 15 * 60 * 1000; // 15 minutes in milliseconds

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge,
      path: '/',
    });
  }

  /**
   * Helper method to clear authentication cookie
   */
  private clearAuthCookie(res: Response) {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('access_token', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 0,
      path: '/',
    });
  }
}
