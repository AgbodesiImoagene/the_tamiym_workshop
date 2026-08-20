/**
 * Auth API functions for the public site.
 */

import { apiClient, API_BASE_URL } from './api';
export type { ApiError } from './api';
import { UserRole } from '@tamiym/types';

export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
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
    return apiClient.post<AuthResponse>('/auth/register', data);
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/login', data);
  },

  logout: async (): Promise<void> => {
    return apiClient.post<void>('/auth/logout');
  },

  getMe: async (): Promise<User> => {
    return apiClient.get<User>('/auth/me');
  },
};
