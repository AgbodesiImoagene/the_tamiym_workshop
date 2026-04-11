import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { REFRESH_TOKEN_COOKIE_NAME } from '../constants';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  phone: null,
  role: 'CUSTOMER' as const,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let mockRes: jest.Mocked<Pick<Response, 'cookie'>>;

  beforeEach(async () => {
    mockRes = {
      cookie: jest.fn(),
    };

    const mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user and return user (no password)', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'Password1!',
        firstName: 'Test',
        lastName: 'User',
      };
      authService.register.mockResolvedValue(mockUser);
      authService.login.mockResolvedValue({
        user: mockUser,
        access_token: 'access',
        refresh_token: 'refresh',
      });

      const result = await controller.register(
        registerDto as any,
        mockRes as unknown as Response,
      );

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(authService.login).toHaveBeenCalledWith({
        email: registerDto.email,
        password: registerDto.password,
      });
      expect(result).toEqual({ user: mockUser });
      expect(result.user).not.toHaveProperty('password');
      expect(mockRes.cookie).toHaveBeenCalled();
    });

    it('should throw ConflictException when email already exists', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      authService.register.mockRejectedValue(
        new ConflictException('Email already exists'),
      );

      await expect(
        controller.register(registerDto as any, mockRes as unknown as Response),
      ).rejects.toThrow(ConflictException);
      expect(authService.login).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should return user and set cookies on success', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      authService.login.mockResolvedValue({
        user: mockUser,
        access_token: 'access',
        refresh_token: 'refresh',
      });

      const result = await controller.login(
        loginDto as any,
        mockRes as unknown as Response,
      );

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual({ user: mockUser });
      expect(mockRes.cookie).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const loginDto = { email: 'test@example.com', password: 'wrong' };
      authService.login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        controller.login(loginDto as any, mockRes as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe', () => {
    it('should return current user', () => {
      const user = { ...mockUser } as any;
      const result = controller.getMe(user);
      expect(result).toBe(user);
      expect(authService.login).not.toHaveBeenCalled();
      expect(authService.register).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should call authService.logout and return message', async () => {
      authService.logout.mockResolvedValue(undefined);
      const mockReq = {
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: 'refresh-token' },
      };

      const result = await controller.logout(
        mockReq as any,
        mockRes as unknown as Response,
      );

      expect(authService.logout).toHaveBeenCalledWith('refresh-token');
      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(mockRes.cookie).toHaveBeenCalled();
    });
  });
});
