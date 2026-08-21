/**
 * API client utility for making authenticated requests
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

/**
 * Customer-surface double-submit CSRF token (TTW-020).
 *
 * The API sets the token as a host-only cookie on its own origin *and*
 * returns it in the body of every session-issuing response (login, register,
 * refresh, `auth/me`). When the API is served from a different origin than
 * this app — the deployed topology — `document.cookie` cannot see that
 * cookie, so the body copy kept here in `sessionStorage` is the only value we
 * can echo back in `X-CSRF-Token`. The browser still attaches the cookie
 * itself, which is the other half of the double submit.
 *
 * Storage key and cookie name must match `CUSTOMER_CSRF_COOKIE_NAME` in
 * apps/api/src/constants.ts.
 */
const CSRF_STORAGE_KEY = 'ttw_customer_csrf';
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

/** `sessionStorage` can throw (SSR, privacy modes, storage disabled). */
function safeSessionStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Persist the CSRF token returned by a session-issuing API response. */
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
    // Storage full or blocked: fall back to the cookie read below.
  }
}

/** Forget the stored CSRF token (e.g. on logout). */
export function clearCsrfToken(): void {
  setCsrfToken(null);
}

/**
 * Current CSRF token: the stored body copy first, then the API cookie as a
 * fallback for same-origin setups (and API-driven tests) where it is readable.
 */
export function getCsrfToken(): string | undefined {
  const storage = safeSessionStorage();
  try {
    const stored = storage?.getItem(CSRF_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // Ignore and fall through to the cookie.
  }
  return readCookie(CSRF_COOKIE_NAME);
}

/**
 * Headers for a mutating (POST/PUT/PATCH/DELETE) request made via raw
 * `fetch` instead of `apiClient` (e.g. multipart/form-data uploads). Returns
 * an empty object when there is no CSRF token to echo (unauthenticated, or
 * bearer-only auth with no cookie session).
 */
export function csrfHeaders(): Record<string, string> {
  const csrfToken = getCsrfToken();
  return csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {};
}

export interface ApiError {
  message: string;
  statusCode?: number;
  code?: string;
  blockers?: Array<{ code: string; message: string }>;
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

    // Double-submit CSRF: echo the stored CSRF token in a request header on
    // cookie-authenticated mutations (TTW-020). No-op if unauthenticated or
    // authenticating via bearer token only (no CSRF token issued).
    if (MUTATING_METHODS.has(method)) {
      const csrfToken = getCsrfToken();
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
        if (typeof data.message === 'string') {
          error.message = data.message;
        } else if (data.message && typeof data.message === 'object') {
          error.message = data.message.message || data.error || response.statusText;
          if (typeof data.message.code === 'string') {
            error.code = data.message.code;
          }
          if (Array.isArray(data.message.blockers)) {
            error.blockers = data.message.blockers;
          }
        } else {
          error.message = data.error || response.statusText;
        }
        if (typeof data.code === 'string') {
          error.code = data.code;
        }
        if (Array.isArray(data.blockers)) {
          error.blockers = data.blockers;
        }
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

  async delete<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

export const apiClient = new ApiClient();
