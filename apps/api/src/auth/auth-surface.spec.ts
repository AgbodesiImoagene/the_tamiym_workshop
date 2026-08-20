import {
  adminOrigins,
  customerOrigins,
  requestOrigin,
  resolveSurfaceFromOrigin,
  resolveLoginSurfaceFromPath,
  allowedRolesForSurface,
  isRoleAllowedForSurface,
} from './auth-surface';
import { AuthSurface } from '../generated/prisma/enums';
import { UserRole } from '../generated/prisma/client';

describe('auth-surface', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('adminOrigins / customerOrigins', () => {
    it('falls back to localhost defaults when env vars are unset', () => {
      delete process.env.AUTH_ADMIN_ORIGINS;
      delete process.env.AUTH_CUSTOMER_ORIGINS;

      expect(adminOrigins()).toEqual(['http://localhost:3003']);
      expect(customerOrigins()).toEqual([
        'http://localhost:3000',
        'http://localhost:3002',
      ]);
    });

    it('parses comma-separated origins from env vars', () => {
      process.env.AUTH_ADMIN_ORIGINS = 'https://admin.example.com';
      process.env.AUTH_CUSTOMER_ORIGINS =
        'https://app.example.com, https://web.example.com';

      expect(adminOrigins()).toEqual(['https://admin.example.com']);
      expect(customerOrigins()).toEqual([
        'https://app.example.com',
        'https://web.example.com',
      ]);
    });

    it('ignores malformed origin entries', () => {
      process.env.AUTH_ADMIN_ORIGINS = 'not-a-url,,http://localhost:3003';

      expect(adminOrigins()).toEqual(['http://localhost:3003']);
    });
  });

  describe('requestOrigin', () => {
    it('prefers the Origin header', () => {
      const req = {
        headers: {
          origin: 'http://localhost:3000',
          referer: 'http://localhost:3003/some/page',
        },
      };
      expect(requestOrigin(req as any)).toBe('http://localhost:3000');
    });

    it('falls back to Referer when Origin is absent', () => {
      const req = { headers: { referer: 'http://localhost:3003/some/page' } };
      expect(requestOrigin(req as any)).toBe('http://localhost:3003');
    });

    it('returns null when neither header is present or parseable', () => {
      expect(requestOrigin({ headers: {} } as any)).toBeNull();
      expect(
        requestOrigin({ headers: { origin: 'not-a-url' } } as any),
      ).toBeNull();
    });
  });

  describe('resolveSurfaceFromOrigin', () => {
    it('resolves ADMIN for an admin-allowlisted origin', () => {
      const req = { headers: { origin: 'http://localhost:3003' } };
      expect(resolveSurfaceFromOrigin(req as any)).toBe(AuthSurface.ADMIN);
    });

    it('resolves CUSTOMER for a customer-allowlisted origin', () => {
      const req = { headers: { origin: 'http://localhost:3000' } };
      expect(resolveSurfaceFromOrigin(req as any)).toBe(AuthSurface.CUSTOMER);
      const req2 = { headers: { origin: 'http://localhost:3002' } };
      expect(resolveSurfaceFromOrigin(req2 as any)).toBe(AuthSurface.CUSTOMER);
    });

    it('returns undefined for an unrecognized origin', () => {
      const req = { headers: { origin: 'http://evil.example.com' } };
      expect(resolveSurfaceFromOrigin(req as any)).toBeUndefined();
    });

    it('returns undefined when there is no Origin/Referer', () => {
      expect(resolveSurfaceFromOrigin({ headers: {} } as any)).toBeUndefined();
    });
  });

  describe('resolveLoginSurfaceFromPath', () => {
    it('resolves ADMIN for /auth/admin/login', () => {
      expect(resolveLoginSurfaceFromPath('/v1/auth/admin/login')).toBe(
        AuthSurface.ADMIN,
      );
      expect(resolveLoginSurfaceFromPath('/v1/AUTH/ADMIN/LOGIN')).toBe(
        AuthSurface.ADMIN,
      );
    });

    it('resolves CUSTOMER for /auth/login', () => {
      expect(resolveLoginSurfaceFromPath('/v1/auth/login')).toBe(
        AuthSurface.CUSTOMER,
      );
    });

    it('resolves CUSTOMER for /auth/register', () => {
      expect(resolveLoginSurfaceFromPath('/v1/auth/register')).toBe(
        AuthSurface.CUSTOMER,
      );
    });

    it('ignores query strings', () => {
      expect(
        resolveLoginSurfaceFromPath('/v1/auth/admin/login?next=/dashboard'),
      ).toBe(AuthSurface.ADMIN);
    });
  });

  describe('allowedRolesForSurface / isRoleAllowedForSurface', () => {
    it('permits only ADMIN on the ADMIN surface', () => {
      expect(allowedRolesForSurface(AuthSurface.ADMIN)).toEqual([
        UserRole.ADMIN,
      ]);
      expect(isRoleAllowedForSurface(UserRole.ADMIN, AuthSurface.ADMIN)).toBe(
        true,
      );
      expect(
        isRoleAllowedForSurface(UserRole.CUSTOMER, AuthSurface.ADMIN),
      ).toBe(false);
      expect(
        isRoleAllowedForSurface(UserRole.ORGANIZER, AuthSurface.ADMIN),
      ).toBe(false);
    });

    it('permits CUSTOMER and ORGANIZER on the CUSTOMER surface', () => {
      expect(allowedRolesForSurface(AuthSurface.CUSTOMER)).toEqual([
        UserRole.CUSTOMER,
        UserRole.ORGANIZER,
      ]);
      expect(
        isRoleAllowedForSurface(UserRole.CUSTOMER, AuthSurface.CUSTOMER),
      ).toBe(true);
      expect(
        isRoleAllowedForSurface(UserRole.ORGANIZER, AuthSurface.CUSTOMER),
      ).toBe(true);
      expect(
        isRoleAllowedForSurface(UserRole.ADMIN, AuthSurface.CUSTOMER),
      ).toBe(false);
    });
  });
});
