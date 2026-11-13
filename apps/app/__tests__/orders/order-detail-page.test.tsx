/**
 * TTW-197: the customer's order shows the order note as plain text, and nothing
 * when there is none.
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

function orderDetail({
  customerNote = null,
  instructions,
}: {
  customerNote?: string | null;
  instructions?: string | null;
} = {}) {
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
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    items: [],
    payments: [],
    refunds: [],
    refundedAmountConfirmed: 0,
    paymentRetryEligible: false,
    shipment: null,
    customerNote,
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

describe('DashboardOrderDetailPage order note (TTW-197)', () => {
  it('shows the note as text, never as markup', async () => {
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(
      orderDetail({ customerNote: 'Pack apart <img src=x onerror=alert(1)>' })
    );
    const { container } = renderPage();

    expect(await screen.findByText('Order note')).toBeInTheDocument();
    expect(screen.getByText('Pack apart <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows no note section when the order has none', async () => {
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail({ customerNote: null }));
    renderPage();

    await screen.findByText('Shipping destination');
    expect(screen.queryByText('Order note')).not.toBeInTheDocument();
  });
});

describe('customer order delivery instructions (TTW-198)', () => {
  it('shows the instructions as text, keeping the line breaks and not reading HTML', async () => {
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(
      orderDetail({ instructions: 'Ring twice\nLeave with the guard <b>please</b>' })
    );
    const { container } = renderPage();

    await screen.findByText('Delivery instructions');
    const text = container.querySelector('[data-testid="order-delivery-instructions"]');
    expect(text?.textContent).toBe('Ring twice\nLeave with the guard <b>please</b>');
    expect(text?.querySelector('b')).toBeNull();
    expect(text).toHaveClass('whitespace-pre-wrap');
  });

  it.each([[null], [undefined], ['']])(
    'shows nothing when the instructions are %p',
    async (value) => {
      (getCustomerOrderDetail as jest.Mock).mockResolvedValue(
        orderDetail({ instructions: value })
      );
      renderPage();

      await waitFor(() => expect(screen.getByText('Shipping destination')).toBeInTheDocument());
      expect(screen.queryByText('Delivery instructions')).not.toBeInTheDocument();
    }
  );
});
