import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { surfaceCookieNames } from './auth-cookies';
import { AuthSurface } from '../generated/prisma/enums';

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

const mockAdminUser = { ...mockUser, role: 'ADMIN' as const };

const CUSTOMER_REFRESH_COOKIE = surfaceCookieNames(
  AuthSurface.CUSTOMER,
).refresh;
const CUSTOMER_CSRF_COOKIE = surfaceCookieNames(AuthSurface.CUSTOMER).csrf;
const ADMIN_REFRESH_COOKIE = surfaceCookieNames(AuthSurface.ADMIN).refresh;

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const ADMIN_ORIGIN = 'http://localhost:3003';

/** Value the controller passed to `res.cookie(name, value, ...)`, if any. */
function cookieValue(
  res: jest.Mocked<Pick<Response, 'cookie'>>,
  name: string,
): string | undefined {
  const call = res.cookie.mock.calls.find(([key]) => key === name);
  return call?.[1] as string | undefined;
}

function buildRequest(opts: {
  origin?: string;
  cookies?: Record<string, string>;
  body?: Record<string, unknown>;
}): Request {
  return {
    headers: opts.origin ? { origin: opts.origin } : {},
    cookies: opts.cookies ?? {},
    body: opts.body ?? {},
  } as unknown as Request;
}

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
      refresh: jest.fn(),
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
    it('should register a new user and log in on the CUSTOMER surface', async () => {
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
      expect(authService.login).toHaveBeenCalledWith(
        {
          email: registerDto.email,
          password: registerDto.password,
        },
        AuthSurface.CUSTOMER,
      );
      expect(result.user).toEqual(mockUser);
      expect(result.user).not.toHaveProperty('password');
      // The CSRF token is returned in the body because a cross-origin SPA
      // cannot read the host-only CSRF cookie (TTW-020).
      expect(result.csrf_token).toBe(
        cookieValue(mockRes, CUSTOMER_CSRF_COOKIE),
      );
      expect(result.csrf_token).toMatch(/^[0-9a-f]{64}$/);
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
    it('logs in on the CUSTOMER surface and sets customer cookies', async () => {
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

      expect(authService.login).toHaveBeenCalledWith(
        loginDto,
        AuthSurface.CUSTOMER,
      );
      expect(result.user).toEqual(mockUser);
      expect(result.csrf_token).toBe(
        cookieValue(mockRes, CUSTOMER_CSRF_COOKIE),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        surfaceCookieNames(AuthSurface.CUSTOMER).access,
        'access',
        expect.anything(),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        surfaceCookieNames(AuthSurface.CUSTOMER).refresh,
        'refresh',
        expect.anything(),
      );
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

  describe('adminLogin', () => {
    it('logs in on the ADMIN surface and sets admin cookies', async () => {
      const loginDto = { email: 'admin@example.com', password: 'password123' };
      authService.login.mockResolvedValue({
        user: mockAdminUser,
        access_token: 'admin-access',
        refresh_token: 'admin-refresh',
      });

      const result = await controller.adminLogin(
        loginDto as any,
        mockRes as unknown as Response,
      );

      expect(authService.login).toHaveBeenCalledWith(
        loginDto,
        AuthSurface.ADMIN,
      );
      expect(result.user).toEqual(mockAdminUser);
      expect(result.csrf_token).toBe(
        cookieValue(mockRes, surfaceCookieNames(AuthSurface.ADMIN).csrf),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        surfaceCookieNames(AuthSurface.ADMIN).access,
        'admin-access',
        expect.anything(),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        surfaceCookieNames(AuthSurface.ADMIN).refresh,
        'admin-refresh',
        expect.anything(),
      );
    });

    it('propagates UnauthorizedException for a role denied on the ADMIN surface', async () => {
      const loginDto = {
        email: 'customer@example.com',
        password: 'password123',
      };
      authService.login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        controller.adminLogin(loginDto as any, mockRes as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe', () => {
    it('returns the current user with the existing session CSRF token', () => {
      const user = { ...mockUser, surface: AuthSurface.CUSTOMER } as any;
      const req = buildRequest({
        origin: CUSTOMER_ORIGIN,
        cookies: {
          [surfaceCookieNames(AuthSurface.CUSTOMER).access]: 'access',
          [CUSTOMER_CSRF_COOKIE]: 'existing-csrf',
        },
      });

      const result = controller.getMe(
        user,
        req,
        mockRes as unknown as Response,
      );

      expect(result).toEqual({ ...user, csrf_token: 'existing-csrf' });
      // Echoing the existing cookie keeps parallel tabs working.
      expect(mockRes.cookie).not.toHaveBeenCalled();
    });

    it('mints a CSRF token when the cookie session has none yet', () => {
      const user = { ...mockUser, surface: AuthSurface.CUSTOMER } as any;
      const req = buildRequest({
        origin: CUSTOMER_ORIGIN,
        cookies: {
          [surfaceCookieNames(AuthSurface.CUSTOMER).access]: 'access',
        },
      });

      const result = controller.getMe(
        user,
        req,
        mockRes as unknown as Response,
      ) as { csrf_token?: string };

      expect(result.csrf_token).toBe(
        cookieValue(mockRes, CUSTOMER_CSRF_COOKIE),
      );
      expect(result.csrf_token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('omits csrf_token for a bearer-only caller (no cookie session)', () => {
      const user = { ...mockAdminUser, surface: AuthSurface.ADMIN } as any;

      const result = controller.getMe(
        user,
        buildRequest({}),
        mockRes as unknown as Response,
      );

      expect(result).not.toHaveProperty('csrf_token');
      expect(mockRes.cookie).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('reads the CUSTOMER refresh cookie when Origin resolves to CUSTOMER', async () => {
      authService.refresh.mockResolvedValue({
        user: mockUser,
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      });
      const mockReq = buildRequest({
        origin: CUSTOMER_ORIGIN,
        cookies: { [CUSTOMER_REFRESH_COOKIE]: 'old-customer-refresh' },
      });

      const result = await controller.refresh(
        mockReq,
        mockRes as unknown as Response,
      );

      expect(authService.refresh).toHaveBeenCalledWith(
        'old-customer-refresh',
        AuthSurface.CUSTOMER,
      );
      expect(result.user).toEqual(mockUser);
      expect(result.csrf_token).toBe(
        cookieValue(mockRes, CUSTOMER_CSRF_COOKIE),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        surfaceCookieNames(AuthSurface.CUSTOMER).refresh,
        'new-refresh',
        expect.anything(),
      );
    });

    it('reads the ADMIN refresh cookie when Origin resolves to ADMIN', async () => {
      authService.refresh.mockResolvedValue({
        user: mockAdminUser,
        access_token: 'new-admin-access',
        refresh_token: 'new-admin-refresh',
      });
      const mockReq = buildRequest({
        origin: ADMIN_ORIGIN,
        cookies: { [ADMIN_REFRESH_COOKIE]: 'old-admin-refresh' },
      });

      await controller.refresh(mockReq, mockRes as unknown as Response);

      expect(authService.refresh).toHaveBeenCalledWith(
        'old-admin-refresh',
        AuthSurface.ADMIN,
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        surfaceCookieNames(AuthSurface.ADMIN).refresh,
        'new-admin-refresh',
        expect.anything(),
      );
    });

    it('rejects a cookie-bearing refresh whose Origin cannot be resolved', async () => {
      const mockReq = buildRequest({
        cookies: { [CUSTOMER_REFRESH_COOKIE]: 'old-customer-refresh' },
      });

      await expect(
        controller.refresh(mockReq, mockRes as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('rejects a refresh whose cookies belong to the other surface', async () => {
      const mockReq = buildRequest({
        origin: CUSTOMER_ORIGIN,
        cookies: { [ADMIN_REFRESH_COOKIE]: 'admin-refresh' },
      });

      await expect(
        controller.refresh(mockReq, mockRes as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('treats a cookie-less body refresh_token as a CUSTOMER non-browser client', async () => {
      authService.refresh.mockResolvedValue({
        user: mockUser,
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      });
      const mockReq = buildRequest({ body: { refresh_token: 'body-refresh' } });

      await controller.refresh(mockReq, mockRes as unknown as Response);

      expect(authService.refresh).toHaveBeenCalledWith(
        'body-refresh',
        AuthSurface.CUSTOMER,
      );
    });

    it('rejects a refresh with neither cookies nor a body token', async () => {
      await expect(
        controller.refresh(buildRequest({}), mockRes as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
      expect(authService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the resolved surface only and clears surface + legacy cookies', async () => {
      authService.logout.mockResolvedValue(undefined);
      const mockReq = buildRequest({
        origin: CUSTOMER_ORIGIN,
        cookies: { [CUSTOMER_REFRESH_COOKIE]: 'refresh-token' },
      });

      const result = await controller.logout(
        mockReq,
        mockRes as unknown as Response,
      );

      expect(authService.logout).toHaveBeenCalledWith(
        'refresh-token',
        AuthSurface.CUSTOMER,
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(mockRes.cookie).toHaveBeenCalledWith(
        surfaceCookieNames(AuthSurface.CUSTOMER).access,
        '',
        expect.anything(),
      );
      // The other surface's cookies are left untouched.
      expect(mockRes.cookie).not.toHaveBeenCalledWith(
        surfaceCookieNames(AuthSurface.ADMIN).access,
        '',
        expect.anything(),
      );
      // Legacy cookies are always cleared too.
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        '',
        expect.anything(),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        '',
        expect.anything(),
      );
    });

    it('rejects a cookie-bearing logout whose Origin cannot be resolved', async () => {
      const mockReq = buildRequest({
        cookies: { [CUSTOMER_REFRESH_COOKIE]: 'refresh-token' },
      });

      await expect(
        controller.logout(mockReq, mockRes as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('rejects a logout whose cookies belong to the other surface', async () => {
      const mockReq = buildRequest({
        origin: ADMIN_ORIGIN,
        cookies: { [CUSTOMER_REFRESH_COOKIE]: 'refresh-token' },
      });

      await expect(
        controller.logout(mockReq, mockRes as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('stays idempotent when there is nothing to revoke', async () => {
      const result = await controller.logout(
        buildRequest({}),
        mockRes as unknown as Response,
      );

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).not.toHaveBeenCalled();
      // Only the legacy names are cleared; no surface is implied.
      expect(mockRes.cookie.mock.calls.map(([name]) => name)).toEqual([
        'access_token',
        'refresh_token',
      ]);
    });
  });
});
