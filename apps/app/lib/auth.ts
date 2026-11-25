/**
 * Auth API functions
 */

import { apiClient, API_BASE_URL, clearCsrfToken, setCsrfToken } from './api';
export type { ApiError } from './api';
import { UserRole } from '@tamiym/types';
import { resetSession } from './session-reset';

export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  /** True when the API reports the email as verified (TTW-023). */
  emailVerified?: boolean;
  /** Version of the profile picture (TTW-263). Absent when the user has none. */
  avatarVersion?: string;
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

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
}

/** Body of `POST /auth/register/start` (TTW-254). */
export interface SignupStartRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/** The API answers the same whether or not the address can be used; the token binds this browser. */
export interface SignupStartResponse {
  message: string;
  signupToken: string;
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

/** Full-page redirect to API Google OAuth start (sets auth cookies on callback). */
export function getGoogleSignInUrl(next = '/dashboard'): string {
  const q = new URLSearchParams({ next });
  return `${API_BASE_URL}/auth/google?${q.toString()}`;
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
   * Register a new user (auto-logs in on the customer surface)
   */
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    setCsrfToken(response.csrf_token);
    resetSession();
    return response;
  },

  /**
   * Start a sign-up (TTW-254). Creates no account and no session: the API emails a 6-digit code
   * and returns a token to keep for the confirmation. The account exists only after
   * `signupVerify` succeeds.
   */
  signupStart: async (data: SignupStartRequest): Promise<SignupStartResponse> =>
    apiClient.post<SignupStartResponse>('/auth/register/start', data),

  /**
   * Confirm the emailed code. On success the API creates the verified account, opens the
   * customer session and returns the CSRF token for it.
   */
  signupVerify: async (signupToken: string, code: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register/verify', {
      signupToken,
      code,
    });
    setCsrfToken(response.csrf_token);
    resetSession();
    return response;
  },

  /** Ask for a new code (60 s cooldown, at most 5 an hour). */
  signupResend: async (signupToken: string): Promise<{ message: string }> =>
    apiClient.post<{ message: string }>('/auth/register/resend', { signupToken }),

  /**
   * Login with email and password
   */
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    setCsrfToken(response.csrf_token);
    resetSession();
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
      resetSession();
    }
  },

  /**
   * Get current user. Also refreshes the stored CSRF token, which is how a
   * tab that never saw a login response (new tab, Google OAuth redirect)
   * learns the token for its existing cookie session.
   */
  getMe: async (): Promise<User> => {
    const user = await apiClient.get<User>('/auth/me');
    if (user.csrf_token) {
      setCsrfToken(user.csrf_token);
    }
    return user;
  },

  /**
   * Ask for a new verification link (TTW-090). The API answers the same way
   * whether or not the account exists, and rate-limits the endpoint.
   */
  resendVerification: async (email: string): Promise<{ message: string }> =>
    apiClient.post<{ message: string }>('/auth/resend-verification', { email }),
};
