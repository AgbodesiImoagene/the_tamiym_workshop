/**
 * Auth API functions for the public site.
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
  /** True when emailVerifiedAt is set (TTW-023 / TTW-032 checkout gate). */
  emailVerified?: boolean;
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
}

export interface AuthResponse {
  user: User;
  csrf_token?: string;
}

/** Full-page redirect to API Google OAuth start (sets customer auth cookies on callback). */
export function getGoogleSignInUrl(next = '/'): string {
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
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    setCsrfToken(response.csrf_token ?? response.user?.csrf_token);
    return response;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    setCsrfToken(response.csrf_token ?? response.user?.csrf_token);
    return response;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post<void>('/auth/logout');
    } finally {
      clearCsrfToken();
    }
  },

  getMe: async (): Promise<User> => {
    const user = await apiClient.get<User>('/auth/me');
    if (user.csrf_token) {
      setCsrfToken(user.csrf_token);
    }
    return user;
  },

  verifyEmail: async (token: string): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>('/auth/verify-email', { token });
  },

  resendVerification: async (email: string): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>('/auth/resend-verification', { email });
  },
};
