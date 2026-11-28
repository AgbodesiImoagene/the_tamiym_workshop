/**
 * TTW-268: the product page shows the price, the stock status, colour swatches and the
 * total quantity, and offers "Start Designing" and "Proceed To Checkout".
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ProductDetailPage from '@/app/dashboard/products/[id]/page';
import { clearCart, getCart, type CartItem } from '@/lib/cart-store';
import { getDesign, type Design } from '@/lib/designs';
import {
  getDashboardProductDetail,
  getDashboardProducts,
  type DashboardProductDetail,
} from '@/lib/products';

const mockPush = jest.fn();
let mockDesignId: string | null = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
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

const detailMock = jest.mocked(getDashboardProductDetail);
const listMock = jest.mocked(getDashboardProducts);
const designMock = jest.mocked(getDesign);

type Variant = DashboardProductDetail['variants'][number];

function makeVariant(
  id: string,
  color: [string, string, string | null] | null,
  size: string,
  extra: Partial<Variant> = {}
): Variant {
  return {
    id,
    name: `${color?.[1] ?? ''} ${size}`.trim(),
    sku: `SKU-${id}`,
    isAvailable: true,
    inStock: true,
    availableQuantity: null,
    resolvedPrice: 5000,
    resolvedCompareAt: null,
    resolvedCurrency: 'NGN',
    optionValues: [
      ...(color
        ? [
            {
              option: { code: 'color', name: 'Colour' },
              optionValue: {
                valueCode: color[0],
                displayName: color[1],
                metadata: color[2] ? { hex: color[2] } : null,
              },
            },
          ]
        : []),
      {
        option: { code: 'size', name: 'Size' },
        optionValue: { valueCode: size, displayName: size },
      },
    ],
    ...extra,
  };
}

const NAVY: [string, string, string] = ['NAVY', 'Navy', '#001f5b'];
const WHITE: [string, string, string] = ['WHITE', 'White', '#ffffff'];

const detail: DashboardProductDetail = {
  id: 'p1',
  name: 'Classic Tee',
  slug: 'classic-tee',
  description: 'A soft cotton tee',
  category: { id: 'c1', name: 'T-Shirts', slug: 't-shirts' },
  prices: [{ amount: 5000, currency: 'NGN' }],
  productImageRoles: [],
  resolvedBasePrice: 5000,
  resolvedBaseCompareAt: null,
  resolvedCurrency: 'NGN',
  images: [],
  variants: [
    makeVariant('v-n-s', NAVY, 'S', { resolvedCompareAt: 8000 }),
    makeVariant('v-n-m', NAVY, 'M', { resolvedCompareAt: 8000 }),
    makeVariant('v-w-s', WHITE, 'S', { resolvedPrice: 6000, availableQuantity: 4 }),
    makeVariant('v-w-m', WHITE, 'M', { resolvedPrice: 7000 }),
  ],
};

const soldOutNavy: DashboardProductDetail = {
  ...detail,
  variants: [
    makeVariant('v-n-s', NAVY, 'S', { inStock: false, availableQuantity: 0 }),
    makeVariant('v-w-s', WHITE, 'S'),
  ],
};

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: 'd1',
    productId: 'p1',
    name: 'Summer logo',
    designData: {} as Design['designData'],
    thumbnailUrl: null,
    moderationStatus: 'APPROVED',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    product: { id: 'p1', name: 'Classic Tee', slug: 'classic-tee' },
    ...overrides,
  };
}

async function openPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProductDetailPage />
    </QueryClientProvider>
  );
  await screen.findByRole('heading', { name: 'Classic Tee', level: 1 });
}

const choose = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const type = (size: string, value: string) =>
  fireEvent.change(screen.getByLabelText(`Quantity for ${size}`), { target: { value } });
const price = () => screen.getByTestId('product-price');
const proceed = () => screen.getByRole('button', { name: 'Proceed To Checkout' });
const lines = (items: CartItem[] | undefined) =>
  (items ?? []).map((line) => [line.variantId, line.quantity]);

beforeEach(() => {
  jest.clearAllMocks();
  mockDesignId = null;
  window.localStorage.clear();
  clearCart();
  detailMock.mockResolvedValue(detail);
  listMock.mockResolvedValue([]);
  designMock.mockResolvedValue(makeDesign());
});

describe('product page price (TTW-268)', () => {
  it('shows the price with the compare-at price struck through', async () => {
    await openPage();

    expect(price()).toHaveTextContent('NGN 5000');
    expect(price()).not.toHaveTextContent('From');
    const compareAt = screen.getByTestId('product-compare-at');
    expect(compareAt).toHaveTextContent('NGN 8000');
    expect(compareAt.tagName).toBe('S');
    // The strike-through alone is silent for a screen reader.
    expect(screen.getByText('Original price:')).toHaveClass('sr-only');
  });

  it('follows the chosen colour, as "From" when its sizes have different prices', async () => {
    await openPage();
    choose('White');

    expect(price()).toHaveTextContent('From NGN 6000');
    expect(screen.queryByTestId('product-compare-at')).not.toBeInTheDocument();
  });

  it('shows the base price of a product that cannot be ordered yet', async () => {
    detailMock.mockResolvedValue({ ...detail, variants: [] });
    await openPage();

    expect(price()).toHaveTextContent('NGN 5000');
  });

  it('says "Quote on request" when there is no price', async () => {
    detailMock.mockResolvedValue({ ...detail, variants: [], resolvedBasePrice: null });
    await openPage();

    expect(price()).toHaveTextContent('Quote on request');
  });
});

describe('product page stock status (TTW-268)', () => {
  it('says whether the chosen colour is in stock', async () => {
    detailMock.mockResolvedValue(soldOutNavy);
    await openPage();

    expect(screen.getByTestId('stock-status')).toHaveTextContent('Out of stock');
    choose('White');
    expect(screen.getByTestId('stock-status')).toHaveTextContent('In stock');
  });

  it('shows no stock status for a product without variants', async () => {
    detailMock.mockResolvedValue({ ...detail, variants: [] });
    await openPage();

    expect(screen.queryByTestId('stock-status')).not.toBeInTheDocument();
  });
});

describe('product page colour swatches (TTW-268)', () => {
  it('shows one named swatch per colour, filled with its hex', async () => {
    await openPage();

    const navy = screen.getByRole('button', { name: 'Navy' });
    expect(navy).toHaveStyle({ backgroundColor: '#001f5b' });
    expect(navy).toHaveTextContent('');
    expect(navy).toHaveAttribute('title', 'Navy');
    expect(navy).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('selected-colour')).toHaveTextContent('Navy');

    choose('White');
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true');
    expect(navy).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('selected-colour')).toHaveTextContent('White');
  });

  it('keeps a text button for a colour without a hex', async () => {
    detailMock.mockResolvedValue({
      ...detail,
      variants: [makeVariant('v-r-s', ['RED', 'Red', null], 'S')],
    });
    await openPage();

    expect(screen.getByRole('button', { name: 'Red' })).toHaveTextContent('Red');
  });

  it('shows the swatch of a product that comes in a single colour', async () => {
    detailMock.mockResolvedValue({ ...detail, variants: [makeVariant('v-n-s', NAVY, 'S')] });
    await openPage();

    expect(screen.getByRole('button', { name: 'Navy' })).toBeInTheDocument();
  });

  it('shows no colour choice for a product without a colour option', async () => {
    detailMock.mockResolvedValue({ ...detail, variants: [makeVariant('v-s', null, 'S')] });
    await openPage();

    expect(screen.queryByText('Colour')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Default' })).not.toBeInTheDocument();
  });
});

describe('product page total quantity (TTW-268)', () => {
  it('adds up the chosen sizes of every colour, capped at the stock', async () => {
    await openPage();
    const total = screen.getByLabelText('Total quantity');
    expect(total).toHaveValue('0');
    expect(total).toHaveAttribute('readonly');

    type('S', '2');
    type('M', '3');
    choose('White');
    type('S', '9');

    expect(total).toHaveValue('9');
  });
});

describe('product page actions (TTW-268)', () => {
  it('links to the design workshop of the product', async () => {
    await openPage();

    expect(screen.getByRole('link', { name: 'Start Designing' })).toHaveAttribute(
      'href',
      '/dashboard/design/new/p1'
    );
  });

  it('offers designing, but no checkout, for a product that cannot be ordered yet', async () => {
    detailMock.mockResolvedValue({ ...detail, variants: [] });
    await openPage();

    expect(screen.getByRole('link', { name: 'Start Designing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proceed To Checkout' })).not.toBeInTheDocument();
  });

  it('puts the chosen sizes in the cart, then opens checkout', async () => {
    let cartAtNavigation: CartItem[] | undefined;
    mockPush.mockImplementation(() => {
      cartAtNavigation = getCart()?.lines;
    });
    await openPage();
    expect(proceed()).toBeDisabled();

    type('S', '2');
    choose('White');
    type('M', '1');
    fireEvent.click(proceed());

    expect(mockPush).toHaveBeenCalledWith('/dashboard/checkout');
    expect(lines(cartAtNavigation)).toEqual([
      ['v-n-s', 2],
      ['v-w-m', 1],
    ]);
    expect(cartAtNavigation?.[1]).toMatchObject({
      productId: 'p1',
      productName: 'Classic Tee',
      optionSummary: 'Colour: White • Size: M',
      unitPrice: 7000,
      currency: 'NGN',
    });
  });

  it('adds the selection only once on a double click', async () => {
    await openPage();
    type('S', '2');
    const button = proceed();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(lines(getCart()?.lines)).toEqual([['v-n-s', 2]]);
  });

  it('keeps what was already in the cart', async () => {
    await openPage();
    type('S', '1');
    choose('Add to cart');
    expect(mockPush).not.toHaveBeenCalled();
    type('M', '2');
    fireEvent.click(proceed());

    expect(lines(getCart()?.lines)).toEqual([
      ['v-n-s', 1],
      ['v-n-m', 2],
    ]);
  });

  it('takes a saved design to checkout, without offering to start a new one', async () => {
    mockDesignId = 'd1';
    await openPage();
    await screen.findByText('Summer logo');

    expect(screen.queryByRole('link', { name: 'Start Designing' })).not.toBeInTheDocument();
    type('S', '2');
    fireEvent.click(proceed());

    expect(getCart()?.lines[0]).toMatchObject({ variantId: 'v-n-s', designId: 'd1' });
    expect(mockPush).toHaveBeenCalledWith('/dashboard/checkout');
  });

  it('offers no checkout for a rejected design', async () => {
    mockDesignId = 'd1';
    designMock.mockResolvedValue(makeDesign({ moderationStatus: 'REJECTED' }));
    await openPage();
    await screen.findByText(/was rejected and cannot be ordered/i);

    expect(screen.queryByRole('button', { name: 'Proceed To Checkout' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Start Designing' })).not.toBeInTheDocument();
  });
});
