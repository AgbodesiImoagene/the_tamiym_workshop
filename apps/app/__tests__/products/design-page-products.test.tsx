/**
 * TTW-230: the design screen shows six products, so it asks the API for six, not twenty.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DesignDashboardPage from '@/app/dashboard/design/page';
import { getMyDesigns } from '@/lib/designs';
import { getDashboardProducts } from '@/lib/products';

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
}));

jest.mock('@/lib/auth', () => ({
  authApi: { getMe: jest.fn().mockResolvedValue({ id: 'user-1', email: 'buyer@example.com' }) },
}));

jest.mock('@/lib/designs', () => ({
  getMyDesigns: jest.fn(),
  deleteDesign: jest.fn(),
  duplicateDesign: jest.fn(),
}));

jest.mock('@/lib/products', () => ({ getDashboardProducts: jest.fn() }));

describe('design screen products (TTW-230)', () => {
  it('asks the API for the six products it shows', async () => {
    jest.mocked(getMyDesigns).mockResolvedValue([]);
    jest.mocked(getDashboardProducts).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        id: `p${i}`,
        name: `Product ${i}`,
        slug: `product-${i}`,
        category: null,
        prices: [],
        productImageRoles: [],
      }))
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DesignDashboardPage />
      </QueryClientProvider>
    );

    expect(await screen.findAllByRole('button', { name: 'Design this product' })).toHaveLength(6);
    expect(getDashboardProducts).toHaveBeenCalledWith({ limit: 6 });
  });
});
