/**
 * TTW-092: the product page lets a customer pick a colour and a quantity per size and
 * adds one cart line per chosen variant, without the Design Workshop.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ProductDetailPage from '@/app/dashboard/products/[id]/page';
import { clearCart, getCart } from '@/lib/cart-store';
import {
  getDashboardProductDetail,
  getDashboardProducts,
  type DashboardProduct,
  type DashboardProductDetail,
} from '@/lib/products';

let mockProductId = 'p1';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ id: mockProductId }),
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

const detailMock = jest.mocked(getDashboardProductDetail);
const listMock = jest.mocked(getDashboardProducts);

function optionValues(color: [string, string], size: [string, string]) {
  return [
    {
      option: { code: 'color', name: 'Colour' },
      optionValue: { valueCode: color[0], displayName: color[1] },
    },
    {
      option: { code: 'size', name: 'Size' },
      optionValue: { valueCode: size[0], displayName: size[1] },
    },
  ];
}

function makeVariant(
  id: string,
  color: [string, string],
  size: [string, string],
  extra: Partial<DashboardProductDetail['variants'][number]> = {}
): DashboardProductDetail['variants'][number] {
  return {
    id,
    name: `${color[1]} / ${size[1]}`,
    sku: `SKU-${id}`,
    isAvailable: true,
    inStock: true,
    availableQuantity: null,
    resolvedPrice: 5000,
    resolvedCompareAt: null,
    resolvedCurrency: 'NGN',
    optionValues: optionValues(color, size),
    ...extra,
  };
}

const BLACK: [string, string] = ['BLACK', 'Black'];
const WHITE: [string, string] = ['WHITE', 'White'];

const detail: DashboardProductDetail = {
  id: 'p1',
  name: 'Classic Tee',
  slug: 'classic-tee',
  description: 'A soft cotton tee',
  category: { id: 'c1', name: 'T-Shirts', slug: 't-shirts' },
  prices: [{ amount: 5000, currency: 'NGN' }],
  productImageRoles: [],
  resolvedBasePrice: 5000,
  resolvedCurrency: 'NGN',
  images: [
    { id: 'i1', variantId: 'v-b-s', url: '/black.png', altText: 'Black tee' },
    { id: 'i2', variantId: 'v-w-s', url: '/white.png', altText: 'White tee' },
  ],
  variants: [
    makeVariant('v-b-s', BLACK, ['S', 'S']),
    makeVariant('v-b-m', BLACK, ['M', 'M']),
    makeVariant('v-b-l', BLACK, ['L', 'L'], { inStock: false, availableQuantity: 0 }),
    makeVariant('v-w-s', WHITE, ['S', 'S'], { availableQuantity: 4 }),
  ],
};

const relatedProducts: DashboardProduct[] = [
  {
    id: 'p1',
    name: 'Classic Tee',
    slug: 'classic-tee',
    category: detail.category,
    prices: [],
    productImageRoles: [],
  },
  {
    id: 'p2',
    name: 'Premium Tee',
    slug: 'premium-tee',
    category: detail.category,
    prices: [],
    productImageRoles: [],
  },
  {
    id: 'p3',
    name: 'Workshop Hoodie',
    slug: 'workshop-hoodie',
    category: { id: 'c2', name: 'Hoodies', slug: 'hoodies' },
    prices: [],
    productImageRoles: [],
  },
];

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
  mockProductId = 'p1';
  window.localStorage.clear();
  clearCart();
  detailMock.mockResolvedValue(detail);
  listMock.mockResolvedValue(relatedProducts);
});

describe('product detail page (TTW-092)', () => {
  it('buys several sizes in one action, one cart line per chosen variant', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });

    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Quantity for M'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    await screen.findByText(/5 items were added to your cart/i);
    expect(screen.getByRole('link', { name: 'Go to cart' })).toHaveAttribute(
      'href',
      '/dashboard/cart'
    );

    const lines = getCart()?.lines ?? [];
    expect(lines.map((line) => [line.variantId, line.quantity])).toEqual([
      ['v-b-s', 2],
      ['v-b-m', 3],
    ]);
    expect(lines[0]).toMatchObject({
      productId: 'p1',
      productName: 'Classic Tee',
      optionSummary: 'Colour: Black • Size: S',
      unitPrice: 5000,
      currency: 'NGN',
    });
  });

  it('shows the sizes and the gallery of the chosen colour', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });

    expect(screen.getByRole('img', { name: 'Black tee' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'White' }));

    expect(screen.getByRole('img', { name: 'White tee' })).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity for S')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity for M')).not.toBeInTheDocument();
  });

  it('keeps what was chosen for another colour out of the cart', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });

    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    await screen.findByText(/3 items were added to your cart/i);
    expect((getCart()?.lines ?? []).map((line) => [line.variantId, line.quantity])).toEqual([
      ['v-b-s', 2],
      ['v-w-s', 1],
    ]);
  });

  it('disables an out-of-stock size and caps a tracked size at its stock', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });

    expect(screen.getByLabelText('Quantity for L')).toBeDisabled();
    expect(screen.getByText(/L.*out of stock/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    await screen.findByText(/4 items were added to your cart/i);
    expect(getCart()?.lines[0]).toMatchObject({ variantId: 'v-w-s', quantity: 4 });
  });

  it('keeps Add to cart disabled until a quantity is chosen', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });

    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
    expect(screen.getByText(/choose a quantity/i)).toBeInTheDocument();
    expect(getCart()).toBeNull();
  });

  it('lists other products of the same category and links to their page', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });

    const related = await screen.findByRole('region', { name: /related products/i });
    const link = within(related).getByRole('link', { name: /Premium Tee/ });
    expect(link).toHaveAttribute('href', '/dashboard/products/p2');
    expect(within(related).queryByText('Classic Tee')).not.toBeInTheDocument();
    expect(within(related).queryByText('Workshop Hoodie')).not.toBeInTheDocument();
  });

  it('says so when no variant can be bought', async () => {
    detailMock.mockResolvedValue({
      ...detail,
      variants: [makeVariant('v-b-s', BLACK, ['S', 'S'], { isAvailable: false })],
    });
    renderPage();

    await screen.findByText(/not available to order yet/i);
    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
  });

  it('shows a loading state, then an error with a working retry', async () => {
    detailMock.mockRejectedValueOnce({ statusCode: 500, message: 'Boom' });
    renderPage();

    expect(screen.getByText(/loading product/i)).toBeInTheDocument();
    await screen.findByText(/could not load this product/i);

    detailMock.mockResolvedValue(detail);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });
    await waitFor(() => expect(detailMock).toHaveBeenCalledTimes(2));
  });

  it('shows a not-found page with a way back to the catalogue', async () => {
    detailMock.mockRejectedValue({ statusCode: 404, message: 'Product not found' });
    renderPage();

    await screen.findByText(/product could not be found/i);
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute(
      'href',
      '/dashboard/products'
    );
  });
});

describe('product detail page, review follow-ups (TTW-092)', () => {
  it('lists everything that will be added, including other colours', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });

    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '1' } });

    const summary = screen.getByTestId('selection-summary');
    expect(summary).toHaveTextContent('Black · S × 2');
    expect(summary).toHaveTextContent('White · S × 1');
  });

  it('starts clean when the customer opens a related product', async () => {
    const { rerender } = renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await screen.findByText(/2 items were added to your cart/i);
    fireEvent.click(screen.getByRole('button', { name: 'White' }));

    mockProductId = 'p2';
    detailMock.mockResolvedValue({ ...detail, id: 'p2', name: 'Premium Tee' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ProductDetailPage />
      </QueryClientProvider>
    );

    await screen.findByRole('heading', { name: 'Premium Tee', level: 1 });
    expect(screen.queryByText(/were added to your cart/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('never adds more than the current stock, even if it dropped after typing', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ProductDetailPage />
      </QueryClientProvider>
    );
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '4' } });

    detailMock.mockResolvedValue({
      ...detail,
      variants: detail.variants.map((entry) =>
        entry.id === 'v-w-s' ? { ...entry, availableQuantity: 1 } : entry
      ),
    });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['dashboard-product'] });
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Quantity for S')).toHaveAttribute('max', '1')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await screen.findByText(/1 item was added to your cart/i);
    expect(getCart()?.lines[0]).toMatchObject({ variantId: 'v-w-s', quantity: 1 });
  });

  it.each([
    ['empty', ''],
    ['negative', '-3'],
    ['not a number', 'abc'],
  ])('treats a %s quantity as zero', async (_label, value) => {
    renderPage();
    await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });

    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Quantity for S'), { target: { value } });

    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
  });
});
