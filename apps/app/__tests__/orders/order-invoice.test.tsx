/**
 * TTW-108: a customer downloads the VAT invoice of a paid order from its page.
 * The button shows only for a paid order, downloads the PDF the API returns,
 * and shows the reason when the API refuses.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardOrderDetailPage from '@/app/dashboard/orders/[id]/page';
import { downloadOrderInvoice, getCustomerOrderDetail } from '@/lib/checkout';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'order-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/components/customer-dashboard-shell', () => ({
  CustomerDashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount}`,
}));

jest.mock('@/components/order-status-banner', () => ({
  OrderStatusBanner: () => <p />,
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
  downloadOrderInvoice: jest.fn(),
}));

function orderDetail(status: string, paymentStatus: string) {
  return {
    policyVersion: 'v1',
    id: 'order-1',
    status,
    paymentStatus,
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

const createObjectURL = jest.fn(() => 'blob:invoice');
const revokeObjectURL = jest.fn();
let clickedDownloads: string[] = [];

beforeEach(() => {
  (getCustomerOrderDetail as jest.Mock).mockReset();
  (downloadOrderInvoice as jest.Mock).mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clickedDownloads = [];
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clickedDownloads.push(this.download);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DashboardOrderDetailPage invoice (TTW-108)', () => {
  it.each(['PAID', 'PROCESSING', 'FULFILLED', 'DELIVERED'])(
    'offers the invoice for a paid order in status %s',
    async (status) => {
      (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail(status, 'SUCCEEDED'));
      renderPage();

      expect(await screen.findByRole('button', { name: 'Download invoice' })).toBeInTheDocument();
    }
  );

  it.each([
    ['PENDING_PAYMENT', 'PENDING'],
    ['CANCELLED', 'PENDING'],
    ['REFUNDED', 'SUCCEEDED'],
  ])('does not offer the invoice for status %s with payment %s', async (status, payment) => {
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail(status, payment));
    renderPage();

    await screen.findByRole('button', { name: 'Refresh' });
    expect(screen.queryByRole('button', { name: 'Download invoice' })).not.toBeInTheDocument();
  });

  it('downloads the PDF the API returns', async () => {
    const user = userEvent.setup();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail('PAID', 'SUCCEEDED'));
    (downloadOrderInvoice as jest.Mock).mockResolvedValue(
      new Blob(['%PDF-1.3'], { type: 'application/pdf' })
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Download invoice' }));

    await waitFor(() => expect(downloadOrderInvoice).toHaveBeenCalledWith('order-1'));
    await waitFor(() => expect(clickedDownloads).toEqual(['invoice-order-1.pdf']));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invoice');
  });

  it('shows the reason when the API refuses, and downloads nothing', async () => {
    const user = userEvent.setup();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail('PAID', 'SUCCEEDED'));
    (downloadOrderInvoice as jest.Mock).mockRejectedValue({
      statusCode: 409,
      code: 'INVOICE_SELLER_DETAILS_MISSING',
      message: 'Invoices are not available yet. The seller details are not set up.',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Download invoice' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invoices are not available yet');
    expect(clickedDownloads).toEqual([]);
  });

  it('disables the button while the file is being prepared, so a double click sends one request', async () => {
    const user = userEvent.setup();
    (getCustomerOrderDetail as jest.Mock).mockResolvedValue(orderDetail('PAID', 'SUCCEEDED'));
    let finish: (blob: Blob) => void = () => {};
    (downloadOrderInvoice as jest.Mock).mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      })
    );
    renderPage();

    const button = await screen.findByRole('button', { name: 'Download invoice' });
    await user.click(button);
    expect(await screen.findByRole('button', { name: 'Preparing invoice...' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Preparing invoice...' }));
    finish(new Blob(['%PDF-1.3']));

    await waitFor(() => expect(clickedDownloads.length).toBe(1));
    expect(downloadOrderInvoice).toHaveBeenCalledTimes(1);
  });
});
