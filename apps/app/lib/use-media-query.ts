import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept up to date. `serverValue` is used for the server
 * render and where `matchMedia` does not exist (tests), so the first paint is stable.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : serverValue,
    () => serverValue
  );
}
