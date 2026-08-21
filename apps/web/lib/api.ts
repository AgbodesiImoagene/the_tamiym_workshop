/**
 * API client for the public site (cookie session + CSRF double-submit).
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

/**
 * Customer-surface double-submit CSRF token (TTW-020 / TTW-032).
 * Matches apps/app/lib/api.ts behaviour so web can call mutating checkout APIs.
 */
const CSRF_STORAGE_KEY = 'ttw_customer_csrf';
const CSRF_COOKIE_NAME = 'ttw_customer_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

function safeSessionStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function setCsrfToken(token: string | null | undefined): void {
  const storage = safeSessionStorage();
  if (!storage) return;
  try {
    if (token) {
      storage.setItem(CSRF_STORAGE_KEY, token);
    } else {
      storage.removeItem(CSRF_STORAGE_KEY);
    }
  } catch {
    // fall back to cookie read
  }
}

export function clearCsrfToken(): void {
  setCsrfToken(null);
}

export function getCsrfToken(): string | undefined {
  const storage = safeSessionStorage();
  try {
    const stored = storage?.getItem(CSRF_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // ignore
  }
  return readCookie(CSRF_COOKIE_NAME);
}

export function csrfHeaders(): Record<string, string> {
  const csrfToken = getCsrfToken();
  return csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {};
}

export interface ApiError {
  message: string;
  statusCode?: number;
  code?: string;
}

export class ApiClient {
  private baseUrl: string;
  private surfaceHeader: string;

  constructor(baseUrl: string = API_BASE_URL, surfaceHeader: string = 'web') {
    this.baseUrl = baseUrl;
    this.surfaceHeader = surfaceHeader;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-App-Surface': this.surfaceHeader,
      ...(options.headers as Record<string, string> | undefined),
    };

    if (MUTATING_METHODS.has(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include',
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const error: ApiError = {
        message: response.statusText,
        statusCode: response.status,
      };

      try {
        const data = (await response.json()) as {
          message?: string | string[];
          error?: string;
          code?: string;
        };
        const message = data.message;
        error.message = Array.isArray(message)
          ? message.join(', ')
          : message || data.error || response.statusText;
        if (typeof data.code === 'string') {
          error.code = data.code;
        }
      } catch {
        // keep statusText
      }

      throw error;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
