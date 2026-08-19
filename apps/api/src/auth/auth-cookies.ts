import type { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
} from '../constants';

export function authCookieBaseOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'none' | 'lax';
  path: string;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
}

function cookieBaseOptions() {
  return authCookieBaseOptions();
}

export function setAccessTokenCookie(res: Response, token: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, token, {
    ...cookieBaseOptions(),
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  });
}

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
    ...cookieBaseOptions(),
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  });
}

export function setAuthTokenCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken);
}

export function clearAuthTokenCookies(res: Response): void {
  const base = cookieBaseOptions();
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, '', { ...base, maxAge: 0 });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, '', { ...base, maxAge: 0 });
}
