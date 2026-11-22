/**
 * TTW-107: a customer cancels an unpaid order from its page. The button shows
 * only while the order awaits payment, asks for a confirmation, calls the API,
 * and shows the cancelled order or the reason it could not be cancelled.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardOrderDetailPage from '@/app/dashboard/orders/[id]/page';
import { cancelCustomerOrder, getCustomerOrderDetail } from '@/lib/checkout';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'order-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/components/customer-dashboard-shell', () => ({
  CustomerDashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount}`,
}));

jest.mock('@/components/order-status-banner', () => ({
  OrderStatusBanner: ({ orderStatus }: { orderStatus: string }) => (
    <p data-testid="status">{orderStatus}</p>
  ),
}));

jest.mock('@/lib/auth', () => ({
  authApi: {
    getMe: jest.fn().mockResolvedValue({ id: 'user-1', email: 'buyer@example.com' }),
  },
}));

jest.mock('@/lib/checkout', () => ({
  getCustomerOrderDetail: jest.fn(),
  initiateOrderPayment: jest.fn(),
  cancelCustomerOrder: jest.fn(),
}));

function orderDetail(status: string) {
  return {
    policyVersion: 'v1',
    id: 'order-1',
    status,
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
    customerNote: null,
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
  (cancelCustomerOrder as jest.Mock).mockReset();
});

describe('DashboardOrderDetailPage cancel order (TTW-107)', () => {
  it('cancels after a confirmation and shows the cancelled order', async () => {
    const user = userEvent.setup();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail('PENDING_PAYMENT'));
    (cancelCustomerOrder as jest.Mock).mockResolvedValue(orderDetail('CANCELLED'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancel order' }));
    // Nothing is sent before the customer confirms.
    expect(cancelCustomerOrder).not.toHaveBeenCalled();
    expect(screen.getByText(/stock is released/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, cancel order' }));

    await waitFor(() => expect(cancelCustomerOrder).toHaveBeenCalledWith('order-1'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('CANCELLED'));
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry payment' })).not.toBeInTheDocument();
  });

  it('keeps the order when the customer backs out of the confirmation', async () => {
    const user = userEvent.setup();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail('PENDING_PAYMENT'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancel order' }));
    await user.click(screen.getByRole('button', { name: 'Keep order' }));

    expect(cancelCustomerOrder).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yes, cancel order' })).not.toBeInTheDocument();
  });

  it('shows the reason and keeps the order when the cancel is refused', async () => {
    const user = userEvent.setup();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail('PENDING_PAYMENT'));
    (cancelCustomerOrder as jest.Mock).mockRejectedValue({
      statusCode: 409,
      message: 'Order is no longer pending payment; cancel aborted',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancel order' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel order' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Order is no longer pending payment; cancel aborted'
    );
    expect(screen.getByTestId('status')).toHaveTextContent('PENDING_PAYMENT');
  });

  it('disables the confirm button while the request runs, so a double click sends one request', async () => {
    const user = userEvent.setup();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail('PENDING_PAYMENT'));
    let finish: (value: unknown) => void = () => undefined;
    (cancelCustomerOrder as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancel order' }));
    const confirm = screen.getByRole('button', { name: 'Yes, cancel order' });
    await user.dblClick(confirm);

    expect(cancelCustomerOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancelling...' })).toBeDisabled();
    finish(orderDetail('CANCELLED'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('CANCELLED'));
  });

  it('stops polling once the order is cancelled, although its payment status stays pending', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      (getCustomerOrderDetail as jest.Mock).mockResolvedValue({
        ...orderDetail('CANCELLED'),
        paymentStatus: 'INITIATED',
      });
      renderPage();
      await screen.findByText('Shipping destination');
      expect(getCustomerOrderDetail).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(12_000);

      expect(getCustomerOrderDetail).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['PAID', 'PROCESSING', 'FULFILLED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])(
    'offers no cancel button on a %s order',
    async (status) => {
      (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail(status));
      renderPage();

      await screen.findByText('Shipping destination');
      expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    }
  );
});
