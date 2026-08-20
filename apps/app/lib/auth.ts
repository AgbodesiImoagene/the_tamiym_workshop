/**
 * Auth API functions
 */

import { apiClient, API_BASE_URL, clearCsrfToken, setCsrfToken } from './api';
export type { ApiError } from './api';
import { UserRole } from '@tamiym/types';

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

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
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
};

export const authApi = {
  /**
   * Register a new user (auto-logs in on the customer surface)
   */
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    setCsrfToken(response.csrf_token);
    return response;
  },

  /**
   * Login with email and password
   */
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
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
};
