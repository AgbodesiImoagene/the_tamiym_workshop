/**
 * API client utility for making authenticated requests
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

/**
 * Customer-surface double-submit CSRF cookie (TTW-020). Readable (non-httpOnly)
 * by design; must match `CUSTOMER_CSRF_COOKIE_NAME` in apps/api/src/constants.ts.
 */
const CSRF_COOKIE_NAME = 'ttw_customer_csrf';
/** Must match `CSRF_HEADER_NAME` in apps/api/src/constants.ts. */
const CSRF_HEADER_NAME = 'x-csrf-token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Headers for a mutating (POST/PUT/PATCH/DELETE) request made via raw
 * `fetch` instead of `apiClient` (e.g. multipart/form-data uploads). Returns
 * an empty object when there is no CSRF cookie to echo (unauthenticated, or
 * bearer-only auth with no cookie session).
 */
export function csrfHeaders(): Record<string, string> {
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  return csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {};
}

export interface ApiError {
  message: string;
  statusCode?: number;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    // Double-submit CSRF: echo the readable CSRF cookie in a request header
    // on cookie-authenticated mutations (TTW-020). No-op if unauthenticated
    // or authenticating via bearer token only (no CSRF cookie present).
    if (MUTATING_METHODS.has(method)) {
      const csrfToken = readCookie(CSRF_COOKIE_NAME);
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include', // Include cookies
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const error: ApiError = {
        message: response.statusText,
        statusCode: response.status,
      };

      try {
        const data = await response.json();
        error.message = data.message || data.error || response.statusText;
      } catch {
        // If response is not JSON, use statusText
      }

      throw error;
    }

    // Handle 204 No Content
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
