export type NavKey = 'home' | 'products' | 'design' | 'orders' | 'fundraiser' | 'cart';

const SEGMENT_TO_NAV: Record<string, NavKey> = {
  products: 'products',
  cart: 'cart',
  checkout: 'cart',
  design: 'design',
  orders: 'orders',
  fundraiser: 'fundraiser',
};

/**
 * Menu entry highlighted for a URL (TTW-260). Matches whole path segments: the first segment
 * after `/dashboard`, or `/orders/<id>/confirm`, which lives outside the dashboard.
 */
export function activeNavForPath(pathname: string | null): NavKey {
  if (!pathname) return 'home';
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'orders') return 'orders';
  if (segments[0] !== 'dashboard') return 'home';
  return SEGMENT_TO_NAV[segments[1] ?? ''] ?? 'home';
}
