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
 * Session renewal (TTW-262).
 *
 * The access cookie lasts 15 minutes, the refresh cookie 7 days. When a request is answered
 * 401 because the access cookie expired, we renew the session and replay the request once,
 * instead of sending the person back to the login page. See
 * docs/14-auth-and-session-architecture.md ("Renewing a customer session").
 */
const RENEWAL_LOCK_NAME = 'ttw-customer-refresh';
/** Shared by the tabs of one browser: when the last successful renewal finished (ms). */
const RENEWED_AT_STORAGE_KEY = 'ttw_customer_renewed_at';
/** `/auth/*` calls that act on the signed-in session: a 401 there can mean "expired". */
const RENEWABLE_AUTH_PATHS = ['/auth/me', '/auth/sessions', '/auth/change-password'];
/** Longest wait for one call of the renewal (CSRF token or refresh). */
const RENEWAL_TIMEOUT_MS = 15_000;
const CSRF_ERROR_MESSAGE = 'Missing or invalid CSRF token';

export type RenewalOutcome = 'renewed' | 'ended';

let renewalInFlight: Promise<RenewalOutcome> | null = null;
let renewedAtInMemory = 0;

function renewalError(statusCode: number): ApiError {
  // Never put a token or a cookie value here.
  return {
    message: 'Could not renew your session. Please try again.',
    statusCode,
    code: 'SESSION_RENEWAL_FAILED',
  };
}

function readRenewedAt(): number {
  let stored = 0;
  try {
    stored = Number(window.localStorage.getItem(RENEWED_AT_STORAGE_KEY)) || 0;
  } catch {
    // Storage blocked: this tab's own memory is enough for single-flight in the tab.
  }
  // A stamp from the future (clock stepped back, garbage) must never skip a needed refresh.
  if (!Number.isFinite(stored) || stored > Date.now()) stored = 0;
  return Math.max(stored, renewedAtInMemory);
}

function markRenewed(): void {
  renewedAtInMemory = Date.now();
  try {
    window.localStorage.setItem(RENEWED_AT_STORAGE_KEY, String(renewedAtInMemory));
  } catch {
    // Ignore: see readRenewedAt.
  }
}

/** Bodies we can send a second time. A stream is consumed by the first attempt. */
function canResendBody(body: BodyInit | null | undefined): boolean {
  if (body == null || typeof body === 'string') return true;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return true;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return true;
  return false;
}

/** Whether a 401 on `endpoint` may mean "access cookie expired" (rule in TTW-262). */
function isRenewablePath(endpoint: string): boolean {
  const path = endpoint.split('?')[0];
  // Never trust a path that could be normalised into another one.
  if (path.includes('..') || path.includes('//')) return false;
  if (!path.startsWith('/auth/') && path !== '/auth') return true;
  return RENEWABLE_AUTH_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

/** One call of the renewal itself: never renewed, never replayed. */
async function renewalCall(
  method: 'GET' | 'POST',
  endpoint: string,
  baseUrl: string
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method === 'POST') {
    const token = getCsrfToken();
    if (token) headers[CSRF_HEADER_NAME] = token;
  }
  // A hung call must not hold the lock (and every tab's requests) forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RENEWAL_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch {
    throw renewalError(503);
  } finally {
    clearTimeout(timer);
  }
}

async function readCsrfFromBody(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as { csrf_token?: unknown };
    return typeof data.csrf_token === 'string' && data.csrf_token ? data.csrf_token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `GET /auth/csrf`: the token of the session cookie, for a tab that lost it.
 * 'ended' when there is no session cookie (401/403). Throws a retryable error on
 * network/5xx/429.
 */
async function syncCsrfToken(baseUrl: string): Promise<RenewalOutcome> {
  const response = await renewalCall('GET', '/auth/csrf', baseUrl);
  if (response.status === 401 || response.status === 403) return 'ended';
  if (!response.ok) throw renewalError(response.status);
  const token = await readCsrfFromBody(response);
  if (token) setCsrfToken(token);
  // Without a token the refresh would be refused (403) and read as a sign-out: retry instead.
  else if (!getCsrfToken()) throw renewalError(503);
  return 'renewed';
}

async function renewSessionOnce(startedAt: number, baseUrl: string): Promise<RenewalOutcome> {
  // Another tab renewed while we waited for the lock: its refresh already covers our request.
  if (readRenewedAt() > startedAt) {
    if (!getCsrfToken()) return syncCsrfToken(baseUrl);
    return 'renewed';
  }

  const csrf = await syncCsrfToken(baseUrl);
  if (csrf === 'ended') return 'ended';

  const response = await renewalCall('POST', '/auth/refresh', baseUrl);
  if (response.status === 401 || response.status === 403) return 'ended';
  if (!response.ok) throw renewalError(response.status);
  const token = await readCsrfFromBody(response);
  if (token) setCsrfToken(token);
  markRenewed();
  return 'renewed';
}

/**
 * Renew the session. One renewal at a time per tab (shared promise) and per browser
 * (`navigator.locks`): a refresh token is single-use, so two renewals at once would sign the
 * loser out.
 */
function renewSession(startedAt: number, baseUrl: string): Promise<RenewalOutcome> {
  if (!renewalInFlight) {
    const run = () => renewSessionOnce(startedAt, baseUrl);
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    const exclusive = locks ? locks.request(RENEWAL_LOCK_NAME, run) : run();
    renewalInFlight = Promise.resolve(exclusive).finally(() => {
      renewalInFlight = null;
    });
  }
  return renewalInFlight;
}

async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const probe = typeof response.clone === 'function' ? response.clone() : response;
    const data = (await probe.json()) as { message?: unknown };
    return data.message === CSRF_ERROR_MESSAGE;
  } catch {
    return false;
  }
}

function buildHeaders(init: RequestInit, method: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  // Multipart: the browser must set Content-Type itself (with the boundary).
  if (!isForm) headers['Content-Type'] = 'application/json';
  Object.assign(headers, init.headers as Record<string, string> | undefined);
  // Double-submit CSRF (TTW-020): rebuilt on every attempt, because a renewal can change it.
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
  }
  return headers;
}

/**
 * Low-level request to the API with the session cookie, the CSRF header and session renewal.
 * Returns the final `Response` (it does not throw on an HTTP error status).
 */
export async function apiFetch(
  endpoint: string,
  init: RequestInit = {},
  baseUrl: string = API_BASE_URL
): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const send = () =>
    fetch(`${baseUrl}${endpoint}`, {
      ...init,
      headers: buildHeaders(init, method),
      credentials: 'include',
    });

  const startedAt = Date.now();
  const response = await send();
  if (!canResendBody(init.body)) return response;

  if (response.status === 401 && isRenewablePath(endpoint)) {
    // A guard 401 happens before the handler ran, so one replay cannot run it twice.
    const outcome = await renewSession(startedAt, baseUrl);
    return outcome === 'renewed' ? send() : response;
  }

  if (MUTATING_METHODS.has(method) && (await isCsrfRejection(response))) {
    // The CSRF guard rejects before the handler too. One resync, one replay.
    try {
      if ((await syncCsrfToken(baseUrl)) === 'renewed') return send();
    } catch {
      // Could not resync: the caller sees the original 403.
    }
  }
  return response;
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

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    parseAs: 'json' | 'blob' = 'json'
  ): Promise<T> {
    const response = await apiFetch(endpoint, options, this.baseUrl);

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

    if (parseAs === 'blob') {
      return (await response.blob()) as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /** GET a file (for example a PDF). Errors are parsed as JSON like any other request. */
  async getBlob(endpoint: string): Promise<Blob> {
    return this.request<Blob>(endpoint, { method: 'GET' }, 'blob');
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
