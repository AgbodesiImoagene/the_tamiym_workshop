/**
 * TTW-092: the list no longer adds "the first in-stock variant, quantity 1" to the cart.
 * Every card sends the customer to the product page, where size and colour are chosen.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardProductsPage from '@/app/dashboard/products/page';
import { getCart } from '@/lib/cart-store';
import { getDashboardProductDetail, getDashboardProducts } from '@/lib/products';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

jest.mock('@/components/customer-dashboard-shell', () => ({
  CustomerDashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount}`,
}));

jest.mock('@/lib/auth', () => ({
  authApi: {
    getMe: jest.fn().mockResolvedValue({ id: 'user-1', email: 'buyer@example.com' }),
  },
}));

jest.mock('@/lib/products', () => ({
  getDashboardProducts: jest.fn(),
  getDashboardProductDetail: jest.fn(),
}));

describe('product list page (TTW-092)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    jest.mocked(getDashboardProducts).mockResolvedValue([
      {
        id: 'p1',
        name: 'Classic Tee',
        slug: 'classic-tee',
        category: { id: 'c1', name: 'T-Shirts', slug: 't-shirts' },
        prices: [{ amount: 5000, currency: 'NGN' }],
        productImageRoles: [],
      },
    ]);
  });

  it('links each card to its product page instead of adding a default variant', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DashboardProductsPage />
      </QueryClientProvider>
    );

    const link = await screen.findByRole('link', { name: 'View product' });
    expect(link).toHaveAttribute('href', '/dashboard/products/p1');
    expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument();
    expect(getDashboardProductDetail).not.toHaveBeenCalled();
    expect(getCart()).toBeNull();
  });
});
