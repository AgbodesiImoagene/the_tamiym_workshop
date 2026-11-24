/**
 * TTW-260: the shared dashboard layout derives the active menu entry from the URL.
 * Expected values are the `activeNav` each page passed by hand before the layout existed.
 */
import { activeNavForPath } from '@/lib/dashboard-nav';

describe('activeNavForPath', () => {
  it.each([
    ['/dashboard', 'home'],
    ['/dashboard/profile', 'home'],
    ['/dashboard/settings', 'home'],
    ['/dashboard/products', 'products'],
    ['/dashboard/products/abc', 'products'],
    ['/dashboard/cart', 'cart'],
    ['/dashboard/checkout', 'cart'],
    ['/dashboard/design', 'design'],
    ['/dashboard/design/new/prod-1', 'design'],
    ['/dashboard/design/d-1/edit', 'design'],
    ['/dashboard/orders', 'orders'],
    ['/dashboard/orders/abc', 'orders'],
    ['/dashboard/fundraiser', 'fundraiser'],
    ['/dashboard/fundraiser/c-1', 'fundraiser'],
    ['/orders/abc/confirm', 'orders'],
  ])('%s -> %s', (path, expected) => {
    expect(activeNavForPath(path)).toBe(expected);
  });

  it('matches whole path segments, not prefixes', () => {
    expect(activeNavForPath('/dashboard/productsX')).toBe('home');
    expect(activeNavForPath('/dashboard/orders-archive')).toBe('home');
  });

  it('falls back to home for an unknown or missing path', () => {
    expect(activeNavForPath('/dashboard/unknown')).toBe('home');
    expect(activeNavForPath(null)).toBe('home');
  });
});
