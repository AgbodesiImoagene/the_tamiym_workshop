/**
 * TTW-254: the sign-up token and the address it was started for live in `sessionStorage`, never in
 * the URL, so a page reload keeps the code screen and closing the tab forgets it. Every access is
 * guarded: storage can be blocked or unavailable.
 */

const TOKEN_KEY = 'ttw_signup_token';
const EMAIL_KEY = 'ttw_signup_email';

export interface PendingSignup {
  signupToken: string;
  email: string;
}

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Subscription for `useSyncExternalStore`: reads storage on the client only, safely for SSR. */
export function subscribePendingSignup(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Stable string snapshot (`token|email`, or empty) for `useSyncExternalStore`: a new object on
 * every call would make React re-render forever.
 */
export function pendingSignupSnapshot(): string {
  const pending = readPendingSignup();
  return pending ? `${pending.signupToken}|${pending.email}` : '';
}

export function parsePendingSignup(snapshot: string): PendingSignup | null {
  const separator = snapshot.indexOf('|');
  if (separator <= 0) return null;
  return { signupToken: snapshot.slice(0, separator), email: snapshot.slice(separator + 1) };
}

// Kept in memory too, so the code screen still works when storage is blocked.
let memoryPending: PendingSignup | null = null;

export function savePendingSignup(pending: PendingSignup): void {
  memoryPending = pending;
  try {
    window.sessionStorage.setItem(TOKEN_KEY, pending.signupToken);
    window.sessionStorage.setItem(EMAIL_KEY, pending.email);
  } catch {
    // Storage unavailable: the in-memory copy keeps the code screen working for this page view.
  }
  notify();
}

export function readPendingSignup(): PendingSignup | null {
  try {
    const signupToken = window.sessionStorage.getItem(TOKEN_KEY);
    const email = window.sessionStorage.getItem(EMAIL_KEY);
    if (signupToken && email) return { signupToken, email };
  } catch {
    // Fall through to the in-memory copy.
  }
  return memoryPending;
}

export function clearPendingSignup(): void {
  memoryPending = null;
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(EMAIL_KEY);
  } catch {
    // Nothing to clear.
  }
  notify();
}
