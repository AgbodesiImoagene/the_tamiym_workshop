/**
 * TTW-262: the customer app renews its session instead of signing the person out after the
 * 15-minute access cookie. `fetch` and `navigator.locks` are mocked; the API rules these
 * tests rely on (a guard 401 happens before the handler, refresh keeps the CSRF token) are
 * covered by apps/api/test/auth-session-renewal.e2e-spec.ts.
 */
import { apiClient, apiFetch, getCsrfToken, setCsrfToken, type ApiError } from '@/lib/api';
import { uploadDesignAsset, uploadThumbnail } from '@/lib/designs';

const BASE = 'http://localhost:3001/v1';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function res(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
    blob: async () => new Blob(['x']),
  } as unknown as Response;
}

interface Call {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[];
let handler: Handler;

function paths(): string[] {
  return calls.map((c) => `${c.method} ${c.path}`);
}
function count(label: string): number {
  return paths().filter((p) => p === label).length;
}

/** Serialising lock, like `navigator.locks.request` across the tabs of one browser. */
function installLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, cb: () => Promise<unknown>) => {
        const run = tail.then(cb, cb);
        tail = run.catch(() => undefined);
        return run;
      },
    },
  });
}

beforeEach(() => {
  calls = [];
  sessionStorage.clear();
  localStorage.clear();
  installLocks();
  handler = () => res(200);
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    calls.push({
      path: url.replace(BASE, ''),
      method: (init.method || 'GET').toUpperCase(),
      headers,
      body: init.body,
    });
    return handler(url, init);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** An API whose access cookie has expired: guarded routes answer 401 until the refresh ran. */
function expiredSession(opts: { refreshStatus?: number; csrfStatus?: number } = {}) {
  const state = { renewed: false, inFlight: 0, maxInFlight: 0 };
  handler = async (url, init) => {
    const path = url.replace(BASE, '');
    const method = (init.method || 'GET').toUpperCase();
    if (path === '/auth/csrf') {
      return opts.csrfStatus ? res(opts.csrfStatus) : res(200, { csrf_token: 'cookie-token' });
    }
    if (path === '/auth/refresh') {
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((r) => setTimeout(r, 5));
      state.inFlight -= 1;
      if (opts.refreshStatus && opts.refreshStatus !== 200) return res(opts.refreshStatus);
      state.renewed = true;
      return res(200, { user: { id: 'u1' }, csrf_token: 'new-token' });
    }
    if (!state.renewed) return res(401, { message: 'Unauthorized' });
    return res(200, { ok: true, path, method });
  };
  return state;
}

describe('refresh and replay', () => {
  it('on a 401, gets the CSRF token, refreshes, then replays and returns the data', async () => {
    expiredSession();
    const data = await apiClient.get<{ ok: boolean }>('/orders');
    expect(data.ok).toBe(true);
    expect(paths()).toEqual(['GET /orders', 'GET /auth/csrf', 'POST /auth/refresh', 'GET /orders']);
  });

  it('replays with the NEW CSRF token and the same body', async () => {
    expiredSession();
    setCsrfToken('old-token');
    await apiClient.post('/cart/items', { variantId: 'v1', quantity: 2 });
    const first = calls[0];
    const replay = calls[calls.length - 1];
    expect(first.headers['x-csrf-token']).toBe('old-token');
    expect(replay.headers['x-csrf-token']).toBe('new-token');
    expect(replay.body).toBe(first.body);
    expect(replay.body).toBe(JSON.stringify({ variantId: 'v1', quantity: 2 }));
    expect(getCsrfToken()).toBe('new-token');
  });

  it('replays only once: a second 401 reaches the caller and nothing refreshes again', async () => {
    handler = (url) => {
      if (url.endsWith('/auth/csrf')) return res(200, { csrf_token: 't' });
      if (url.endsWith('/auth/refresh')) return res(200, { csrf_token: 't2' });
      return res(401, { message: 'Unauthorized' });
    };
    await expect(apiClient.get('/orders')).rejects.toMatchObject({ statusCode: 401 });
    expect(count('POST /auth/refresh')).toBe(1);
    expect(count('GET /orders')).toBe(2);
  });

  it('keeps an Idempotency-Key header on the replay', async () => {
    expiredSession();
    await apiFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'Idempotency-Key': 'key-123' },
    });
    const orderCalls = calls.filter((c) => c.path === '/orders');
    expect(orderCalls).toHaveLength(2);
    expect(orderCalls[1].headers['Idempotency-Key']).toBe('key-123');
  });

  it('a successful refresh does not clear the stored session state', async () => {
    expiredSession();
    setCsrfToken('old-token');
    await apiClient.get('/orders');
    expect(getCsrfToken()).toBe('new-token');
  });
});

describe('single flight', () => {
  it('five parallel 401s (and the /auth/me of a banner and a layout) send one refresh', async () => {
    expiredSession();
    await Promise.all([
      apiClient.get('/orders'),
      apiClient.get('/cart'),
      apiClient.get('/auth/me'),
      apiClient.get('/auth/me'),
      apiClient.get('/designs'),
    ]);
    expect(count('POST /auth/refresh')).toBe(1);
    expect(count('GET /auth/csrf')).toBe(1);
  });

  it('two tabs never refresh together and the second tab reuses the first renewal', async () => {
    const state = expiredSession();
    let tabA!: typeof import('@/lib/api');
    let tabB!: typeof import('@/lib/api');
    await jest.isolateModulesAsync(async () => {
      tabA = await import('@/lib/api');
    });
    await jest.isolateModulesAsync(async () => {
      tabB = await import('@/lib/api');
    });
    await Promise.all([tabA.apiClient.get('/orders'), tabB.apiClient.get('/cart')]);
    expect(state.maxInFlight).toBe(1);
    expect(count('POST /auth/refresh')).toBe(1);
  });

  it('works without navigator.locks (falls back to the tab promise)', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    expiredSession();
    await Promise.all([apiClient.get('/orders'), apiClient.get('/cart')]);
    expect(count('POST /auth/refresh')).toBe(1);
  });
});

describe('failure taxonomy', () => {
  it.each([401, 403])(
    'a refresh answered %i ends the session: the original 401 reaches the caller',
    async (status) => {
      expiredSession({ refreshStatus: status });
      await expect(apiClient.get('/orders')).rejects.toMatchObject({ statusCode: 401 });
      expect(count('POST /auth/refresh')).toBe(1);
      expect(count('GET /orders')).toBe(1);
    }
  );

  it('an expired refresh token does not loop: the next failing request tries once more, not forever', async () => {
    expiredSession({ refreshStatus: 401 });
    await expect(apiClient.get('/orders')).rejects.toMatchObject({ statusCode: 401 });
    await expect(apiClient.get('/cart')).rejects.toMatchObject({ statusCode: 401 });
    expect(count('POST /auth/refresh')).toBe(2);
  });

  it('no session cookie at all (the CSRF call answers 401): the original 401 reaches the caller', async () => {
    expiredSession({ csrfStatus: 401 });
    await expect(apiClient.get('/auth/me')).rejects.toMatchObject({ statusCode: 401 });
    expect(count('POST /auth/refresh')).toBe(0);
  });

  it.each([500, 502, 503, 429])(
    'a refresh answered %i is retryable and is not a sign-out',
    async (status) => {
      expiredSession({ refreshStatus: status });
      const error = (await apiClient.get('/orders').catch((e: unknown) => e)) as ApiError;
      expect(error.statusCode).toBe(status);
      expect(error.statusCode).not.toBe(401);
      expect(error.code).toBe('SESSION_RENEWAL_FAILED');
    }
  );

  it('a network error while refreshing is retryable, and the shared promise is reset', async () => {
    let failRefresh = true;
    let renewed = false;
    handler = (url) => {
      if (url.endsWith('/auth/csrf')) return res(200, { csrf_token: 't' });
      if (url.endsWith('/auth/refresh')) {
        if (failRefresh) throw new TypeError('Failed to fetch');
        renewed = true;
        return res(200, { csrf_token: 't2' });
      }
      return renewed ? res(200, { ok: true }) : res(401);
    };
    const error = (await apiClient.get('/orders').catch((e: unknown) => e)) as ApiError;
    expect(error.statusCode).not.toBe(401);
    expect(error.code).toBe('SESSION_RENEWAL_FAILED');

    failRefresh = false;
    await expect(apiClient.get('/orders')).resolves.toEqual({ ok: true });
    expect(count('POST /auth/refresh')).toBe(2);
  });
});

describe('eligibility', () => {
  const never: Array<[string, string]> = [
    ['POST', '/auth/login'],
    ['POST', '/auth/register'],
    ['POST', '/auth/register/start'],
    ['POST', '/auth/register/resend'],
    ['POST', '/auth/register/verify'],
    ['POST', '/auth/forgot-password'],
    ['POST', '/auth/reset-password'],
    ['POST', '/auth/verify-email'],
    ['POST', '/auth/resend-verification'],
    ['POST', '/auth/logout'],
    ['POST', '/auth/refresh'],
    ['GET', '/auth/csrf'],
  ];
  it.each(never)('%s %s answered 401 is never refreshed or replayed', async (method, path) => {
    handler = () => res(401, { message: 'Invalid credentials' });
    await expect(apiFetch(path, { method }).then((r) => r.status)).resolves.toBe(401);
    expect(paths()).toEqual([`${method} ${path}`]);
  });

  const always: Array<[string, string]> = [
    ['GET', '/auth/me'],
    ['GET', '/auth/sessions'],
    ['DELETE', '/auth/sessions/abc'],
    ['DELETE', '/auth/sessions'],
    ['POST', '/auth/change-password'],
    ['GET', '/orders?limit=5'],
  ];
  it.each(always)('%s %s answered 401 is refreshed and replayed', async (method, path) => {
    expiredSession();
    const response = await apiFetch(path, {
      method,
      body: method === 'POST' ? JSON.stringify({}) : undefined,
    });
    expect(response.status).toBe(200);
    expect(count('POST /auth/refresh')).toBe(1);
  });

  it('does not replay a body that cannot be sent again (a stream)', async () => {
    expiredSession();
    // jsdom has no ReadableStream: any body that is not text, form data or binary is a stream.
    const stream = { getReader: () => undefined };
    const response = await apiFetch('/designs/import', {
      method: 'POST',
      body: stream as unknown as BodyInit,
    });
    expect(response.status).toBe(401);
    expect(count('POST /auth/refresh')).toBe(0);
  });

  it('never replays a 5xx or a non-CSRF 403', async () => {
    handler = () => res(500);
    await expect(apiClient.get('/orders')).rejects.toMatchObject({ statusCode: 500 });
    handler = () => res(403, { message: 'Forbidden resource' });
    await expect(apiClient.post('/orders', {})).rejects.toMatchObject({ statusCode: 403 });
    expect(count('POST /auth/refresh')).toBe(0);
    expect(paths()).toEqual(['GET /orders', 'POST /orders']);
  });
});

describe('CSRF resync', () => {
  it('a 403 "Missing or invalid CSRF token" gets the token again and replays once', async () => {
    setCsrfToken('stale');
    handler = (url, init) => {
      if (url.endsWith('/auth/csrf')) return res(200, { csrf_token: 'fresh' });
      const header = (init.headers as Record<string, string>)['x-csrf-token'];
      return header === 'fresh'
        ? res(200, { saved: true })
        : res(403, { message: 'Missing or invalid CSRF token' });
    };
    await expect(apiClient.patch('/users/profile', { firstName: 'A' })).resolves.toEqual({
      saved: true,
    });
    expect(paths()).toEqual(['PATCH /users/profile', 'GET /auth/csrf', 'PATCH /users/profile']);
    expect(getCsrfToken()).toBe('fresh');
  });

  it('resyncs only once: a second CSRF 403 reaches the caller', async () => {
    handler = (url) =>
      url.endsWith('/auth/csrf')
        ? res(200, { csrf_token: 'fresh' })
        : res(403, { message: 'Missing or invalid CSRF token' });
    await expect(apiClient.post('/cart/items', {})).rejects.toMatchObject({ statusCode: 403 });
    expect(count('GET /auth/csrf')).toBe(1);
    expect(count('POST /cart/items')).toBe(2);
  });
});

describe('no stored CSRF token (new tab)', () => {
  it('asks GET /auth/csrf before refreshing', async () => {
    expiredSession();
    expect(getCsrfToken()).toBeUndefined();
    await apiClient.get('/orders');
    const order = paths();
    expect(order.indexOf('GET /auth/csrf')).toBeLessThan(order.indexOf('POST /auth/refresh'));
    const refresh = calls.find((c) => c.path === '/auth/refresh')!;
    expect(refresh.headers['x-csrf-token']).toBe('cookie-token');
  });
});

describe('uploads', () => {
  it('a thumbnail upload is renewed and replayed with the same FormData and no Content-Type', async () => {
    expiredSession();
    await expect(
      uploadThumbnail('d1', new Blob(['png'], { type: 'image/png' }))
    ).resolves.toMatchObject({ ok: true });
    const uploads = calls.filter((c) => c.path === '/designs/d1/thumbnail');
    expect(uploads).toHaveLength(2);
    expect(uploads[1].body).toBe(uploads[0].body);
    expect(uploads[1].body).toBeInstanceOf(FormData);
    expect(Object.keys(uploads[1].headers).map((h) => h.toLowerCase())).not.toContain(
      'content-type'
    );
    expect(uploads[1].headers['x-csrf-token']).toBe('new-token');
  });

  it('a design asset upload is renewed and replayed', async () => {
    expiredSession();
    await uploadDesignAsset(new File(['x'], 'a.png', { type: 'image/png' }));
    expect(count('POST /design-assets/upload')).toBe(2);
    expect(count('POST /auth/refresh')).toBe(1);
  });

  it('an upload refused for good still throws the API error shape', async () => {
    handler = () => res(413, { message: 'File too large' });
    await expect(uploadDesignAsset(new File(['x'], 'a.png'))).rejects.toMatchObject({
      statusCode: 413,
      message: 'File too large',
    });
  });
});

describe('secrecy', () => {
  it('never writes a token to the console, even when renewal fails', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined)
    );
    setCsrfToken('secret-old-token');
    expiredSession();
    await apiClient.get('/orders');
    expiredSession({ refreshStatus: 503 });
    await apiClient.get('/cart').catch(() => undefined);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('puts no token in a renewal error message', async () => {
    expiredSession({ refreshStatus: 503 });
    const error = (await apiClient.get('/orders').catch((e: unknown) => e)) as ApiError;
    expect(JSON.stringify(error)).not.toMatch(/token/i);
  });
});

describe('review hardening (TTW-262)', () => {
  it('a renewal call that hangs times out into a retryable error and frees the lock', async () => {
    jest.useFakeTimers();
    try {
      handler = (url, init) => {
        if (url.endsWith('/auth/csrf')) return res(200, { csrf_token: 't' });
        if (url.endsWith('/auth/refresh')) {
          return new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          });
        }
        return res(401);
      };
      const pending = apiClient.get('/orders').catch((e: unknown) => e) as Promise<ApiError>;
      await jest.advanceTimersByTimeAsync(60_000);
      const error = await pending;
      expect(error.code).toBe('SESSION_RENEWAL_FAILED');
      expect(error.statusCode).not.toBe(401);
      // The shared promise was reset: a later 401 starts a new renewal.
      const again = apiClient.get('/cart').catch((e: unknown) => e) as Promise<ApiError>;
      await jest.advanceTimersByTimeAsync(60_000);
      expect((await again).code).toBe('SESSION_RENEWAL_FAILED');
      expect(count('POST /auth/refresh')).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a "renewed at" stamp from the future (clock stepped back or garbage)', async () => {
    localStorage.setItem('ttw_customer_renewed_at', String(Date.now() + 1e9));
    expiredSession();
    await expect(apiClient.get('/orders')).resolves.toMatchObject({ ok: true });
    expect(count('POST /auth/refresh')).toBe(1);
  });

  it('ignores a garbage "renewed at" stamp', async () => {
    localStorage.setItem('ttw_customer_renewed_at', 'not-a-number');
    expiredSession();
    await expect(apiClient.get('/orders')).resolves.toMatchObject({ ok: true });
    expect(count('POST /auth/refresh')).toBe(1);
  });

  it('a CSRF call answered 200 without a token is a retryable failure, not a sign-out', async () => {
    handler = (url) => (url.endsWith('/auth/csrf') ? res(200, {}) : res(401));
    const error = (await apiClient.get('/orders').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('SESSION_RENEWAL_FAILED');
    expect(count('POST /auth/refresh')).toBe(0);
  });

  it.each(['/auth/me-evil', '/auth/mex', '/auth', '/auth/sessionsX', '/auth/me/../login'])(
    '%s answered 401 is not renewed',
    async (path) => {
      handler = () => res(401);
      await expect(apiFetch(path).then((r) => r.status)).resolves.toBe(401);
      expect(paths()).toEqual([`GET ${path}`]);
    }
  );
});
