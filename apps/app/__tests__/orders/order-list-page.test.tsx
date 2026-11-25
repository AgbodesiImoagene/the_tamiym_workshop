/**
 * TTW-253: the order history shows no stand-in picture. The orders API sends no product
 * photo, so each card says the image is not available.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardOrdersPage from '@/app/dashboard/orders/page';
import { getCustomerOrders } from '@/lib/dashboard';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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

jest.mock('@/lib/dashboard', () => ({
  getCustomerOrders: jest.fn(),
}));

function order(id: string, name: string) {
  return {
    id,
    status: 'PAID',
    paymentStatus: 'PAID',
    totalAmount: 5000,
    currency: 'NGN',
    createdAt: '2026-11-01T10:00:00.000Z',
    items: [
      {
        id: `${id}-item`,
        quantity: 1,
        productNameSnapshot: name,
        variantDisplaySnapshot: 'Black / S',
        snapshotSource: 'ORDER',
        unitFinalPrice: 5000,
      },
    ],
  };
}

describe('order history page', () => {
  it('says the image is not available, with no stand-in picture, on each order', async () => {
    jest
      .mocked(getCustomerOrders)
      .mockResolvedValue([order('o1', 'Classic Tee'), order('o2', 'Workshop Hoodie')] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <DashboardOrdersPage />
      </QueryClientProvider>
    );

    await screen.findByText('Classic Tee');
    expect(screen.getAllByText('Image not available')).toHaveLength(2);
    expect(container.querySelector('img[src*="product-fallback"]')).toBeNull();
  });
});
