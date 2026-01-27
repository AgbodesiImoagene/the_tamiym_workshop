/**
 * Auth API functions
 */

import { apiClient } from './api';
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
  role?: UserRole;
}

export interface AuthResponse {
  user: User;
}

export const authApi = {
  /**
   * Register a new user
   */
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/register', data);
  },

  /**
   * Login with email and password
   */
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/login', data);
  },

  /**
   * Logout
   */
  logout: async (): Promise<void> => {
    return apiClient.post<void>('/auth/logout');
  },

  /**
   * Get current user
   */
  getMe: async (): Promise<User> => {
    return apiClient.get<User>('/auth/me');
  },
};
