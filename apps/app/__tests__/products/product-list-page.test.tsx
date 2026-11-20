/**
 * TTW-092: the list no longer adds "the first in-stock variant, quantity 1" to the cart.
 * Every card sends the customer to the product page, where size and colour are chosen.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardProductsPage from '@/app/dashboard/products/page';
import { getCart } from '@/lib/cart-store';
import {
  getDashboardCategories,
  getDashboardProductDetail,
  getDashboardProducts,
} from '@/lib/products';

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
  getDashboardCategories: jest.fn(),
  getDashboardProducts: jest.fn(),
  getDashboardProductDetail: jest.fn(),
}));

describe('product list page (TTW-092)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    jest.mocked(getDashboardCategories).mockResolvedValue([]);
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

describe('product list categories and pagination (TTW-093)', () => {
  const PAGE_SIZE = 12;

  function makeProducts(count: number, prefix = 'p') {
    return Array.from({ length: count }, (_, i) => ({
      id: `${prefix}${i + 1}`,
      name: `${prefix} product ${i + 1}`,
      slug: `${prefix}-${i + 1}`,
      category: { id: 'c1', name: 'Mugs', slug: 'mugs' },
      prices: [{ amount: 5000, currency: 'NGN' }],
      productImageRoles: [],
    }));
  }

  function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <DashboardProductsPage />
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getDashboardCategories).mockResolvedValue([
      { id: 'c1', name: 'Mugs', slug: 'mugs' },
      { id: 'c2', name: 'Posters', slug: 'posters' },
    ]);
    jest.mocked(getDashboardProducts).mockResolvedValue(makeProducts(3));
  });

  it('builds the tabs from the API categories instead of a fixed list', async () => {
    renderPage();

    expect(await screen.findByRole('tab', { name: 'Mugs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Posters' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Hoodies' })).not.toBeInTheDocument();
  });

  it('asks the API for the chosen category, from the first page', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'Posters' }));

    await waitFor(() =>
      expect(getDashboardProducts).toHaveBeenLastCalledWith({
        categorySlug: 'posters',
        limit: PAGE_SIZE + 1,
        offset: 0,
      })
    );
  });

  it('shows an explicit empty message for a category with no product', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('tab', { name: 'Posters' });
    jest.mocked(getDashboardProducts).mockResolvedValue([]);

    await user.click(screen.getByRole('tab', { name: 'Posters' }));

    expect(await screen.findByText('No products in this category yet.')).toBeInTheDocument();
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('pages forward and back, and resets to page 1 when the category changes', async () => {
    const user = userEvent.setup();
    jest.mocked(getDashboardProducts).mockImplementation(async (params) => {
      const all = makeProducts(20);
      const offset = params?.offset ?? 0;
      return all.slice(offset, offset + (params?.limit ?? 20));
    });
    renderPage();

    expect(await screen.findAllByRole('link', { name: 'View product' })).toHaveLength(PAGE_SIZE);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(getDashboardProducts).toHaveBeenLastCalledWith({
        categorySlug: undefined,
        limit: PAGE_SIZE + 1,
        offset: PAGE_SIZE,
      })
    );
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'View product' })).toHaveLength(20 - PAGE_SIZE)
    );
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'View product' })).toHaveLength(PAGE_SIZE)
    );

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2');
    await user.click(screen.getByRole('tab', { name: 'Mugs' }));
    await screen.findByText('Page 1');
    expect(getDashboardProducts).toHaveBeenLastCalledWith({
      categorySlug: 'mugs',
      limit: PAGE_SIZE + 1,
      offset: 0,
    });
  });

  it('does not tag any product as a best seller (no sales data behind it)', async () => {
    renderPage();
    await screen.findAllByRole('link', { name: 'View product' });
    expect(screen.queryByText('Best Seller')).not.toBeInTheDocument();
  });

  it('shows no pagination when everything fits on one page', async () => {
    renderPage();
    await screen.findAllByRole('link', { name: 'View product' });
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });
});
