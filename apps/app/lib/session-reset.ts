/**
 * TTW-260: the signed-in user is cached for the whole dashboard, so the cache must be dropped
 * whenever the session changes (login, register, sign-up confirmation, logout, 401).
 * `lib/auth.ts` raises the event; `app/providers.tsx` clears the query cache on it.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onSessionReset(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetSession(): void {
  listeners.forEach((listener) => listener());
}
