import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextState {
  requestId?: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  source?: string | null;
}

const storage = new AsyncLocalStorage<RequestContextState>();

export function runWithRequestContext<T>(
  initialState: RequestContextState,
  callback: () => T,
): T {
  return storage.run(initialState, callback);
}

export function getRequestContext(): RequestContextState | undefined {
  return storage.getStore();
}

export function updateRequestContext(
  updates: Partial<RequestContextState>,
): RequestContextState | undefined {
  const current = storage.getStore();
  if (!current) {
    return undefined;
  }

  Object.assign(current, updates);
  return current;
}
