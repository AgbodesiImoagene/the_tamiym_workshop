/**
 * TTW-197: the customer's order shows the order note as plain text, and nothing
 * when there is none.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardOrderDetailPage from '@/app/dashboard/orders/[id]/page';
import { getCustomerOrderDetail } from '@/lib/checkout';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'order-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/components/customer-dashboard-shell', () => ({
  CustomerDashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount}`,
}));

jest.mock('@/components/order-status-banner', () => ({
  OrderStatusBanner: () => <h1>Status</h1>,
}));

jest.mock('@/lib/auth', () => ({
  authApi: {
    getMe: jest.fn().mockResolvedValue({ id: 'user-1', email: 'buyer@example.com' }),
  },
}));

jest.mock('@/lib/checkout', () => ({
  getCustomerOrderDetail: jest.fn(),
  initiateOrderPayment: jest.fn(),
}));

function orderDetail(customerNote: string | null) {
  return {
    policyVersion: 'v1',
    id: 'order-1',
    status: 'PENDING_PAYMENT',
    paymentStatus: 'PENDING',
    currency: 'NGN',
    subtotalAmount: 5000,
    shippingFee: 2000,
    discountAmount: 0,
    totalAmount: 7000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [],
    shipping: {
      recipientName: 'Ada',
      line1: '1 Allen Avenue',
      city: 'Ikeja',
      state: 'Lagos',
      country: 'Nigeria',
    },
    payments: [],
    refunds: [],
    refundedAmountConfirmed: 0,
    paymentRetryEligible: false,
    customerNote,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardOrderDetailPage />
    </QueryClientProvider>
  );
}

describe('DashboardOrderDetailPage order note (TTW-197)', () => {
  it('shows the note as text, never as markup', async () => {
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(
      orderDetail('Pack apart <img src=x onerror=alert(1)>')
    );
    const { container } = renderPage();

    expect(await screen.findByText('Order note')).toBeInTheDocument();
    expect(screen.getByText('Pack apart <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows no note section when the order has none', async () => {
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail(null));
    renderPage();

    await screen.findByText('Shipping destination');
    expect(screen.queryByText('Order note')).not.toBeInTheDocument();
  });
});
