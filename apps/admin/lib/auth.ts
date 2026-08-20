/**
 * Auth API functions
 */

import { apiClient, clearCsrfToken, setCsrfToken } from './api';
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

export const authApi = {
  /**
   * Login with email and password (admin surface — TTW-020).
   * Non-ADMIN credentials are rejected by the API.
   */
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/admin/login', data);
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
