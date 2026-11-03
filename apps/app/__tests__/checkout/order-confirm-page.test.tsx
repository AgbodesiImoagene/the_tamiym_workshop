/**
 * TTW-037: the standard cart is cleared only once the backend reports the pending
 * order as paid.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import OrderConfirmPage from '@/app/orders/[id]/confirm/page';
import { addCartItem, getCart, setCartPendingOrder } from '@/lib/cart-store';
import { getCustomerOrderDetail } from '@/lib/checkout';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'order-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/components/customer-dashboard-shell', () => ({
  CustomerDashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount}`,
}));

jest.mock('@/components/order-status-banner', () => ({
  OrderStatusBanner: ({ paymentStatus }: { paymentStatus: string }) => <h1>{paymentStatus}</h1>,
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

function orderDetail(paymentStatus: string, status: string) {
  return {
    id: 'order-1',
    status,
    paymentStatus,
    currency: 'NGN',
    totalAmount: 7000,
    items: [],
    paymentRetryEligible: false,
  };
}

function seedPendingCart() {
  addCartItem({
    productId: 'prod-1',
    productName: 'Classic Tee',
    variantId: 'var-1',
    variantName: 'Small / Red',
    optionSummary: 'Size: Small',
    quantity: 1,
    unitPrice: 5000,
    currency: 'NGN',
  });
  setCartPendingOrder('order-1');
}

// The page loads the user, then the order; allow for a busy CI machine.
const LOAD_TIMEOUT = { timeout: 5000 };

let client: QueryClient;

function renderConfirm() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderConfirmPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  client?.clear();
});

describe('OrderConfirmPage cart clearing', () => {
  it('clears the cart when its pending order is paid', async () => {
    seedPendingCart();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail('SUCCEEDED', 'PAID'));

    renderConfirm();

    await screen.findByRole('heading', { name: 'SUCCEEDED' }, LOAD_TIMEOUT);
    await waitFor(() => expect(getCart()?.lines ?? []).toHaveLength(0));
  });

  it('keeps the cart while the payment is not settled', async () => {
    seedPendingCart();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(
      orderDetail('FAILED', 'PENDING_PAYMENT')
    );

    renderConfirm();

    await screen.findByRole('heading', { name: 'FAILED' }, LOAD_TIMEOUT);
    expect(getCart()?.lines).toHaveLength(1);
    expect(getCart()?.pendingOrderId).toBe('order-1');
  });
});
