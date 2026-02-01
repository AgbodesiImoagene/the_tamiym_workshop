import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole, UserStatus, TokenType } from '../generated/prisma/client';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  MAIL_QUEUE_NAME,
  JOB_VERIFICATION_EMAIL,
  JOB_PASSWORD_RESET_EMAIL,
  VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from '../constants';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectQueue(MAIL_QUEUE_NAME) private mailQueue: Queue,
  ) {}

  /**
   * Register a new user
   * @param registerDto Registration data
   * @returns User object without password
   * @throws ConflictException if email already exists
   */
  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        passwordHash: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone ?? null,
        role: registerDto.role ?? UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
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

    await this.enqueueVerificationEmail(user.id, user.email);
    return user;
  }

  /**
   * Verify email using token from verification link.
   * @throws BadRequestException if token invalid or expired
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    const record = await this.prisma.authToken.findFirst({
      where: { token, tokenType: TokenType.EMAIL_VERIFICATION },
      include: { user: true },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.authToken.delete({ where: { id: record.id } });
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.authToken.delete({ where: { id: record.id } }),
    ]);

    return { message: 'Email verified successfully' };
  }

  /**
   * Resend verification email. Always returns success to avoid leaking account existence.
   */
  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email, status: { not: UserStatus.DELETED } },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (user && !user.emailVerifiedAt) {
      await this.enqueueVerificationEmail(user.id, user.email);
    }

    return {
      message:
        'If an account exists with this email, a verification link has been sent',
    };
  }

  /**
   * Request password reset. Sends reset link to email if user exists. Always returns success.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email, status: { not: UserStatus.DELETED } },
      select: { id: true, email: true },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
      await this.prisma.authToken.create({
        data: {
          userId: user.id,
          token,
          tokenType: TokenType.PASSWORD_RESET,
          expiresAt,
        },
      });
      const baseUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await this.mailQueue.add(JOB_PASSWORD_RESET_EMAIL, {
        to: user.email,
        resetUrl,
      });
    }

    return {
      message:
        'If an account exists with this email, a password reset link has been sent',
    };
  }

  /**
   * Reset password using token from reset link.
   * @throws BadRequestException if token invalid or expired
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const record = await this.prisma.authToken.findFirst({
      where: { token, tokenType: TokenType.PASSWORD_RESET },
      include: { user: true },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.authToken.delete({ where: { id: record.id } });
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.authToken.delete({ where: { id: record.id } }),
    ]);

    return { message: 'Password has been reset successfully' };
  }

  /**
   * Change password for authenticated user (requires current password).
   * @throws BadRequestException if current password is wrong
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password has been changed successfully' };
  }

  private async createVerificationToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.prisma.authToken.create({
      data: {
        userId,
        token,
        tokenType: TokenType.EMAIL_VERIFICATION,
        expiresAt,
      },
    });
    return token;
  }

  private async enqueueVerificationEmail(
    userId: string,
    email: string,
  ): Promise<void> {
    const token = await this.createVerificationToken(userId);
    const baseUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.mailQueue.add(JOB_VERIFICATION_EMAIL, {
      to: email,
      token,
      verifyUrl,
    });
  }

  /**
   * Authenticate user and return access + refresh tokens and user data
   * @param loginDto Login credentials
   * @returns Access token, refresh token, and user data
   */
  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId: user.id,
          token: refreshToken,
          tokenType: TokenType.REFRESH,
          expiresAt: refreshExpiresAt,
        },
      }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * Issue new access token (and optionally rotate refresh token) using a valid refresh token.
   * @throws UnauthorizedException if refresh token missing, invalid, or expired
   */
  async refresh(refreshToken: string) {
    const record = await this.prisma.authToken.findFirst({
      where: { token: refreshToken, tokenType: TokenType.REFRESH },
      include: { user: true },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.authToken.delete({ where: { id: record.id } });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = record.user;
    if (user.status === UserStatus.DELETED) {
      await this.prisma.authToken.delete({ where: { id: record.id } });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);

    // Rotate refresh token: delete old, create new
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.authToken.delete({ where: { id: record.id } }),
      this.prisma.authToken.create({
        data: {
          userId: user.id,
          token: newRefreshToken,
          tokenType: TokenType.REFRESH,
          expiresAt: refreshExpiresAt,
        },
      }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * Invalidate a refresh token (e.g. on logout). No-op if token not found.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.authToken.deleteMany({
      where: { token: refreshToken, tokenType: TokenType.REFRESH },
    });
  }
}
