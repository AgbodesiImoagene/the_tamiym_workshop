/**
 * Auth API functions
 */

import { apiClient, clearCsrfToken, setCsrfToken } from './api';
export type { ApiError } from './api';
import { UserRole } from '@tamiym/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  /**
   * Session CSRF token echoed back by the API for cookie sessions (TTW-020).
   * Absent for bearer-only callers.
   */
  csrf_token?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  /**
   * Double-submit CSRF token for the new session (TTW-020). Stored in
   * `sessionStorage` and echoed in `X-CSRF-Token` on mutating requests,
   * because the matching API cookie is host-only on the API origin and so is
   * unreadable from this app when the two are on different origins.
   */
  csrf_token?: string;
}

/** Password-only admin login response before MFA completes (TTW-023). */
export type AdminMfaStatus = 'ENROLLMENT_REQUIRED' | 'CHALLENGE_REQUIRED';

export interface AdminMfaChallengeResponse {
  mfa: { status: AdminMfaStatus };
  mfa_token: string;
}

export interface AdminMfaEnrollmentStart {
  otpauth_uri: string;
  secret: string;
  recovery_codes: string[];
}

function isMfaChallengeResponse(
  value: AuthResponse | AdminMfaChallengeResponse
): value is AdminMfaChallengeResponse {
  return typeof value === 'object' && value !== null && 'mfa' in value && 'mfa_token' in value;
}

/** Full-page redirect to API Google OAuth start for existing admin accounts only. */
export function getAdminGoogleSignInUrl(next = '/admin'): string {
  const q = new URLSearchParams({ next });
  return `${API_BASE_URL}/auth/google/admin?${q.toString()}`;
}

export const GOOGLE_SIGN_IN_ERROR_MESSAGES: Record<string, string> = {
  google_denied: 'Google sign-in was cancelled.',
  google_state: 'Sign-in session expired. Please try again.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_unavailable: 'Google sign-in is not available right now.',
  google_admin_forbidden:
    'This Google account is not allowed for admin sign-in. Use an existing admin account.',
};

export const authApi = {
  /**
   * Password step for admin login (TTW-023). Never issues a session; returns
   * an MFA challenge/enrollment token that must be completed next.
   */
  login: async (data: LoginRequest): Promise<AdminMfaChallengeResponse> => {
    const response = await apiClient.post<AuthResponse | AdminMfaChallengeResponse>(
      '/auth/admin/login',
      data
    );
    if (!isMfaChallengeResponse(response)) {
      throw new Error('Admin login did not return an MFA challenge');
    }
    return response;
  },

  /** Start TOTP enrollment; returns otpauth URI + recovery codes once. */
  mfaEnrollStart: async (mfaToken: string): Promise<AdminMfaEnrollmentStart> => {
    return apiClient.post<AdminMfaEnrollmentStart>('/auth/admin/mfa/enroll/start', {
      mfa_token: mfaToken,
    });
  },

  /** Confirm enrollment with TOTP and receive an admin session. */
  mfaEnrollConfirm: async (mfaToken: string, totp: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/admin/mfa/enroll/confirm', {
      mfa_token: mfaToken,
      totp,
    });
    setCsrfToken(response.csrf_token);
    return response;
  },

  /** Complete MFA challenge with TOTP and receive an admin session. */
  mfaChallenge: async (mfaToken: string, totp: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/admin/mfa/challenge', {
      mfa_token: mfaToken,
      totp,
    });
    setCsrfToken(response.csrf_token);
    return response;
  },

  /** Complete MFA with a single-use recovery code and receive an admin session. */
  mfaRecover: async (mfaToken: string, recoveryCode: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/admin/mfa/recover', {
      mfa_token: mfaToken,
      recovery_code: recoveryCode,
    });
    setCsrfToken(response.csrf_token);
    return response;
  },

  /**
   * Rotate the session (new access + refresh cookies) and re-store the
   * rotated CSRF token.
   */
  refresh: async (): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/refresh');
    setCsrfToken(response.csrf_token);
    return response;
  },

  /**
   * Logout
   */
  logout: async (): Promise<void> => {
    try {
      await apiClient.post<void>('/auth/logout');
    } finally {
      clearCsrfToken();
    }
  },

  /**
   * Get current user. Also refreshes the stored CSRF token, which is how a
   * tab that never saw a login response (new tab, restored session) learns
   * the token for its existing cookie session.
   */
  getMe: async (): Promise<User> => {
    const user = await apiClient.get<User>('/auth/me');
    if (user.csrf_token) {
      setCsrfToken(user.csrf_token);
    }
    return user;
  },
};
