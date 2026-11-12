/**
 * TTW-198: the customer order shows the delivery instructions saved on the order,
 * as plain text, and nothing when there are none.
 */
import { render, screen, waitFor } from '@testing-library/react';
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

function orderDetail(instructions?: string | null) {
  return {
    id: 'order-1',
    status: 'PAID',
    paymentStatus: 'SUCCEEDED',
    currency: 'NGN',
    subtotalAmount: 5000,
    shippingFee: 2000,
    discountAmount: 0,
    totalAmount: 7000,
    createdAt: '2026-11-01T10:00:00.000Z',
    items: [],
    payments: [],
    refunds: [],
    paymentRetryEligible: false,
    shipment: null,
    shipping: {
      recipientName: 'Ada',
      phone: '+2348000000000',
      line1: '1 Allen Avenue',
      line2: null,
      city: 'Ikeja',
      state: 'Lagos',
      postalCode: null,
      country: 'Nigeria',
      landmark: null,
      ...(instructions === undefined ? {} : { instructions }),
    },
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

beforeEach(() => {
  (getCustomerOrderDetail as jest.Mock).mockReset();
});

describe('customer order delivery instructions', () => {
  it('shows the instructions as text, keeping the line breaks and not reading HTML', async () => {
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(
      orderDetail('Ring twice\nLeave with the guard <b>please</b>')
    );
    const { container } = renderPage();

    await screen.findByText('Delivery instructions');
    const text = container.querySelector('[data-testid="order-delivery-instructions"]');
    expect(text?.textContent).toBe('Ring twice\nLeave with the guard <b>please</b>');
    expect(text?.querySelector('b')).toBeNull();
    expect(text).toHaveClass('whitespace-pre-wrap');
  });

  it.each([[null], [undefined], ['']])('shows nothing when the instructions are %p', async (value) => {
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail(value));
    renderPage();

    await waitFor(() => expect(screen.getByText('Shipping destination')).toBeInTheDocument());
    expect(screen.queryByText('Delivery instructions')).not.toBeInTheDocument();
  });
});
