/**
 * TTW-058: the product page, opened for a saved design (`?designId=`), prices the chosen
 * sizes with the server quote and adds one cart line per size that carries the design.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ProductDetailPage from '@/app/dashboard/products/[id]/page';
import { clearCart, getCart } from '@/lib/cart-store';
import { quoteOrder } from '@/lib/checkout';
import { getDesign, type Design } from '@/lib/designs';
import { getUserAddresses } from '@/lib/profile';
import { getDashboardProductDetail, getDashboardProducts } from '@/lib/products';
import type { DashboardProductDetail } from '@/lib/products';

let mockDesignId: string | null = 'd1';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ id: 'p1' }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'designId' ? mockDesignId : null),
  }),
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
  getDashboardProductDetail: jest.fn(),
  getDashboardProducts: jest.fn(),
}));
jest.mock('@/lib/designs', () => ({ getDesign: jest.fn() }));
jest.mock('@/lib/checkout', () => ({ quoteOrder: jest.fn() }));
jest.mock('@/lib/profile', () => ({ getUserAddresses: jest.fn() }));

const detailMock = jest.mocked(getDashboardProductDetail);
const listMock = jest.mocked(getDashboardProducts);
const designMock = jest.mocked(getDesign);
const quoteMock = jest.mocked(quoteOrder);
const addressesMock = jest.mocked(getUserAddresses);

function variant(id: string, size: string): DashboardProductDetail['variants'][number] {
  return {
    id,
    name: size,
    sku: `SKU-${id}`,
    isAvailable: true,
    inStock: true,
    availableQuantity: null,
    resolvedPrice: 5000,
    resolvedCompareAt: null,
    resolvedCurrency: 'NGN',
    optionValues: [
      {
        option: { code: 'size', name: 'Size' },
        optionValue: { valueCode: size, displayName: size },
      },
    ],
  };
}

const detail: DashboardProductDetail = {
  id: 'p1',
  name: 'Classic Tee',
  slug: 'classic-tee',
  description: null,
  category: { id: 'c1', name: 'T-Shirts', slug: 't-shirts' },
  prices: [{ amount: 5000, currency: 'NGN' }],
  productImageRoles: [],
  resolvedBasePrice: 5000,
  resolvedCurrency: 'NGN',
  images: [],
  variants: [variant('v-s', 'S'), variant('v-m', 'M')],
};

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: 'd1',
    productId: 'p1',
    name: 'Summer logo',
    designData: {} as Design['designData'],
    thumbnailUrl: '/designs/d1/thumbnail',
    moderationStatus: 'APPROVED',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    product: { id: 'p1', name: 'Classic Tee', slug: 'classic-tee' },
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProductDetailPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDesignId = 'd1';
  window.localStorage.clear();
  clearCart();
  detailMock.mockResolvedValue(detail);
  listMock.mockResolvedValue([]);
  designMock.mockResolvedValue(makeDesign());
  addressesMock.mockResolvedValue([
    { id: 'addr-1', addressLine1: '1 Street', city: 'Ikeja', state: 'Lagos', isDefault: true },
  ]);
  quoteMock.mockResolvedValue({
    currency: 'NGN',
    subtotalAmount: 13000,
    discountAmount: 0,
    shippingFee: 2000,
    vatAmount: 0,
    totalAmount: 15000,
    items: [
      { variantId: 'v-s', designId: 'd1', quantity: 1, unitFinalPrice: 6000, lineTotal: 6000 },
      { variantId: 'v-m', designId: 'd1', quantity: 2, unitFinalPrice: 3500, lineTotal: 7000 },
    ],
  });
});

describe('product page for a saved design (TTW-058)', () => {
  it('shows which design is ordered and adds one design line per size', async () => {
    renderPage();
    await screen.findByText('Summer logo');

    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Quantity for M'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    await screen.findByText(/3 items were added to your cart/i);
    const lines = getCart()?.lines ?? [];
    expect(lines.map((line) => [line.variantId, line.designId, line.quantity])).toEqual([
      ['v-s', 'd1', 1],
      ['v-m', 'd1', 2],
    ]);
    expect(lines[0]).toMatchObject({
      designName: 'Summer logo',
      imageUrl: expect.stringContaining('/designs/d1/thumbnail'),
    });
  });

  it('keeps two designs on the same variant as two cart lines', async () => {
    const first = renderPage();
    await screen.findByText('Summer logo');
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await screen.findByText(/1 item was added to your cart/i);
    first.unmount();

    mockDesignId = 'd2';
    designMock.mockResolvedValue(makeDesign({ id: 'd2', name: 'Winter logo' }));
    renderPage();
    await screen.findByText('Winter logo');
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await screen.findByText(/1 item was added to your cart/i);

    const lines = getCart()?.lines ?? [];
    expect(lines.map((line) => [line.variantId, line.designId])).toEqual([
      ['v-s', 'd1'],
      ['v-s', 'd2'],
    ]);
  });

  it('shows the server price of the chosen sizes with "Get price"', async () => {
    renderPage();
    await screen.findByText('Summer logo');
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Quantity for M'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get price' }));

    await screen.findByText('Subtotal: NGN 13000');
    expect(quoteMock).toHaveBeenCalledWith({
      shippingAddressId: 'addr-1',
      items: [
        { variantId: 'v-s', quantity: 1, designId: 'd1' },
        { variantId: 'v-m', quantity: 2, designId: 'd1' },
      ],
    });
    expect(screen.getByText('NGN 6000 each')).toBeInTheDocument();

    // The cart keeps the quoted unit price (display only: checkout quotes again).
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await screen.findByText(/3 items were added to your cart/i);
    expect(getCart()?.lines.map((line) => line.unitPrice)).toEqual([6000, 3500]);
  });

  it('forgets the price when the quantities change', async () => {
    renderPage();
    await screen.findByText('Summer logo');
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get price' }));
    await screen.findByText('Subtotal: NGN 13000');

    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '2' } });
    expect(screen.queryByText('Subtotal: NGN 13000')).not.toBeInTheDocument();
  });

  it('drops a price that comes back after the quantities changed', async () => {
    let resolveQuote: (value: Awaited<ReturnType<typeof quoteOrder>>) => void = () => {};
    quoteMock.mockReturnValueOnce(new Promise((resolve) => (resolveQuote = resolve)));
    renderPage();
    await screen.findByText('Summer logo');
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get price' }));
    await waitFor(() => expect(quoteMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '5' } });
    await act(async () => {
      resolveQuote({
        currency: 'NGN',
        subtotalAmount: 6000,
        discountAmount: 0,
        shippingFee: 0,
        vatAmount: 0,
        totalAmount: 6000,
        items: [
          { variantId: 'v-s', designId: 'd1', quantity: 1, unitFinalPrice: 6000, lineTotal: 6000 },
        ],
      });
    });
    expect(screen.queryByText(/^Subtotal:/)).not.toBeInTheDocument();
  });

  it('asks for a delivery address when the customer has none', async () => {
    addressesMock.mockResolvedValue([]);
    renderPage();
    await screen.findByText('Summer logo');
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get price' }));

    expect((await screen.findByRole('status')).textContent).toMatch(
      /add a delivery address to see the price/i
    );
    expect(quoteMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /delivery address/i })).toHaveAttribute(
      'href',
      '/dashboard/settings'
    );
  });

  it('shows a retryable error when the quote fails', async () => {
    quoteMock.mockRejectedValue({ statusCode: 500, message: 'boom' });
    renderPage();
    await screen.findByText('Summer logo');
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get price' }));
    await screen.findByText(/could not get the price/i);
    expect(screen.getByRole('button', { name: 'Get price' })).toBeEnabled();
  });

  it('refuses a rejected design and hides the picker', async () => {
    designMock.mockResolvedValue(makeDesign({ moderationStatus: 'REJECTED' }));
    renderPage();
    await screen.findByText(/was rejected and cannot be ordered/i);
    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to my designs' })).toHaveAttribute(
      'href',
      '/dashboard/design'
    );
  });

  it('refuses a design made for another product', async () => {
    designMock.mockResolvedValue(makeDesign({ productId: 'p9' }));
    renderPage();
    await screen.findByText(/is not a design of this product/i);
    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
  });

  it('says so when the design cannot be found', async () => {
    designMock.mockRejectedValue({ statusCode: 404, message: 'Not found' });
    renderPage();
    await screen.findByText(/this design could not be found/i);
    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
  });

  it('still works without a design', async () => {
    mockDesignId = null;
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() => expect(getCart()?.lines).toHaveLength(1));
    expect(getCart()?.lines[0].designId).toBeNull();
    expect(designMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Get price' })).not.toBeInTheDocument();
  });
});
