import type { Request, Response } from 'express';
import {
  clearAllAuthCookies,
  clearSurfaceAuthCookies,
  ensureSurfaceCsrfCookie,
  setSurfaceAuthCookies,
  surfaceCookieNames,
  surfacesWithSessionCookies,
} from './auth-cookies';
import { AuthSurface } from '../generated/prisma/enums';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from '../constants';

type CookieCall = [name: string, value: string, options: Record<string, any>];

function buildResponse(): {
  res: Response;
  calls: CookieCall[];
  valueFor: (name: string) => string | undefined;
} {
  const calls: CookieCall[] = [];
  const res = {
    cookie: (name: string, value: string, options: Record<string, any>) => {
      calls.push([name, value, options]);
    },
  } as unknown as Response;
  return {
    res,
    calls,
    valueFor: (name) => calls.find(([key]) => key === name)?.[1],
  };
}

function buildRequest(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

const customer = surfaceCookieNames(AuthSurface.CUSTOMER);
const admin = surfaceCookieNames(AuthSurface.ADMIN);

describe('auth cookies', () => {
  describe('setSurfaceAuthCookies', () => {
    it('returns the generated CSRF token and sets it as the surface CSRF cookie', () => {
      const { res, valueFor } = buildResponse();

      const csrfToken = setSurfaceAuthCookies(
        res,
        AuthSurface.CUSTOMER,
        'access',
        'refresh',
      );

      expect(csrfToken).toMatch(/^[0-9a-f]{64}$/);
      expect(valueFor(customer.csrf)).toBe(csrfToken);
      expect(valueFor(customer.access)).toBe('access');
      expect(valueFor(customer.refresh)).toBe('refresh');
    });

    it('returns a different token on every call', () => {
      const first = setSurfaceAuthCookies(
        buildResponse().res,
        AuthSurface.ADMIN,
        'a',
        'r',
      );
      const second = setSurfaceAuthCookies(
        buildResponse().res,
        AuthSurface.ADMIN,
        'a',
        'r',
      );
      expect(first).not.toBe(second);
    });

    it('leaves the CSRF cookie readable to JS and clears the opposite surface', () => {
      const { res, calls, valueFor } = buildResponse();

      setSurfaceAuthCookies(res, AuthSurface.ADMIN, 'access', 'refresh');

      const csrfCall = calls.find(([name]) => name === admin.csrf);
      expect(csrfCall?.[2].httpOnly).toBe(false);
      expect(valueFor(customer.access)).toBe('');
      expect(valueFor(ACCESS_TOKEN_COOKIE_NAME)).toBe('');
      expect(valueFor(REFRESH_TOKEN_COOKIE_NAME)).toBe('');
    });
  });

  describe('surfacesWithSessionCookies', () => {
    it('reports the surface whose access cookie is present', () => {
      expect(
        surfacesWithSessionCookies(buildRequest({ [customer.access]: 'a' })),
      ).toEqual([AuthSurface.CUSTOMER]);
    });

    it('reports a surface presenting only its refresh cookie', () => {
      expect(
        surfacesWithSessionCookies(buildRequest({ [admin.refresh]: 'r' })),
      ).toEqual([AuthSurface.ADMIN]);
    });

    it('ignores a CSRF cookie on its own', () => {
      expect(
        surfacesWithSessionCookies(buildRequest({ [customer.csrf]: 'tok' })),
      ).toEqual([]);
    });

    it('reports both surfaces when both hold cookies', () => {
      expect(
        surfacesWithSessionCookies(
          buildRequest({ [customer.access]: 'a', [admin.refresh]: 'r' }),
        ),
      ).toEqual([AuthSurface.CUSTOMER, AuthSurface.ADMIN]);
    });

    it('tolerates a request with no cookies at all', () => {
      expect(surfacesWithSessionCookies({} as Request)).toEqual([]);
    });

    it('treats an empty-string access cookie as absent', () => {
      expect(
        surfacesWithSessionCookies(buildRequest({ [customer.access]: '' })),
      ).toEqual([]);
    });

    it('treats an empty-string refresh cookie as absent', () => {
      expect(
        surfacesWithSessionCookies(buildRequest({ [admin.refresh]: '' })),
      ).toEqual([]);
    });

    it('reports the surface when access is empty but refresh is present', () => {
      // Guards against `access ?? refresh`-style logic: an empty string is
      // not nullish, so it must not short-circuit past a real refresh cookie.
      expect(
        surfacesWithSessionCookies(
          buildRequest({ [customer.access]: '', [customer.refresh]: 'r' }),
        ),
      ).toEqual([AuthSurface.CUSTOMER]);
    });

    it('reports the surface when refresh is empty but access is present', () => {
      expect(
        surfacesWithSessionCookies(
          buildRequest({ [admin.access]: 'a', [admin.refresh]: '' }),
        ),
      ).toEqual([AuthSurface.ADMIN]);
    });
  });

  describe('ensureSurfaceCsrfCookie', () => {
    it('echoes an existing CSRF cookie without setting a new one', () => {
      const { res, calls } = buildResponse();
      const req = buildRequest({
        [customer.access]: 'access',
        [customer.csrf]: 'existing-token',
      });

      expect(ensureSurfaceCsrfCookie(req, res, AuthSurface.CUSTOMER)).toBe(
        'existing-token',
      );
      expect(calls).toHaveLength(0);
    });

    it('mints and sets a token when the session cookie has no CSRF companion', () => {
      const { res, valueFor } = buildResponse();
      const req = buildRequest({ [admin.access]: 'access' });

      const token = ensureSurfaceCsrfCookie(req, res, AuthSurface.ADMIN);

      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(valueFor(admin.csrf)).toBe(token);
    });

    it('issues nothing for a request with no surface session cookie (bearer-only)', () => {
      const { res, calls } = buildResponse();

      expect(
        ensureSurfaceCsrfCookie(buildRequest({}), res, AuthSurface.CUSTOMER),
      ).toBeUndefined();
      expect(calls).toHaveLength(0);
    });
  });

  describe('clearing', () => {
    it('expires the surface cookies it clears', () => {
      const { res, calls } = buildResponse();
      clearSurfaceAuthCookies(res, AuthSurface.CUSTOMER);
      expect(calls.map(([name]) => name)).toEqual([
        customer.access,
        customer.refresh,
        customer.csrf,
      ]);
      expect(calls.every(([, , options]) => options.maxAge === 0)).toBe(true);
    });

    it('clears both surfaces and the legacy names', () => {
      const { res, calls } = buildResponse();
      clearAllAuthCookies(res);
      const names = calls.map(([name]) => name);
      expect(names).toContain(customer.access);
      expect(names).toContain(admin.access);
      expect(names).toContain(ACCESS_TOKEN_COOKIE_NAME);
      expect(names).toContain(REFRESH_TOKEN_COOKIE_NAME);
    });
  });
});
