/**
 * TTW-204: the product list card shows only what the data supports: the product's own
 * colours and size range, a price line from its real bulk tier, and "No Minimum".
 */
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardProductsPage from '@/app/dashboard/products/page';
import { getDashboardCategories, getDashboardProducts } from '@/lib/products';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
  getDashboardCategories: jest.fn(),
  getDashboardProducts: jest.fn(),
  getDashboardProductDetail: jest.fn(),
}));

type ListProduct = Awaited<ReturnType<typeof getDashboardProducts>>[number];

const tee: ListProduct = {
  id: 'p1',
  name: 'Classic Tee',
  slug: 'classic-tee',
  description: 'A long description that must not replace the minimum line',
  category: { id: 'c1', name: 'T-Shirts', slug: 't-shirts' },
  prices: [{ amount: 5000, currency: 'NGN' }],
  productImageRoles: [],
  colors: [
    { code: 'RED', name: 'Red', hex: '#ef2557' },
    { code: 'BLUE', name: 'Blue', hex: '#1497c6' },
  ],
  sizeRange: 'S-5XL',
  bulkTier: { minQuantity: 30, pricePerUnit: 3800 },
};

const bareProduct: ListProduct = {
  id: 'p2',
  name: 'Bare Cap',
  slug: 'bare-cap',
  category: { id: 'c2', name: 'Caps', slug: 'caps' },
  prices: [],
  productImageRoles: [],
  colors: [],
  sizeRange: null,
  bulkTier: null,
};

function renderPage(products: ListProduct[]) {
  jest.mocked(getDashboardCategories).mockResolvedValue([]);
  jest.mocked(getDashboardProducts).mockResolvedValue(products);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardProductsPage />
    </QueryClientProvider>
  );
}

async function cardOf(name: string) {
  // The "Preview" placeholder cards show before the catalogue loads: wait for a real card.
  const links = await screen.findAllByRole('link', { name: /^View product/ });
  const card = links
    .map((link) => link.closest('article'))
    .find((article) => article && within(article).queryByText(name));
  if (!card) throw new Error(`No card for ${name}`);
  return card;
}

describe('product list card (TTW-204)', () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the product's own colours, not a fixed palette", async () => {
    renderPage([tee]);
    const card = await cardOf('Classic Tee');

    const colours = within(card).getAllByTestId('product-colour');
    expect(colours.map((dot) => dot.getAttribute('title'))).toEqual(['Red', 'Blue']);
    expect(colours[0]).toHaveStyle({ backgroundColor: '#ef2557' });
    expect(colours[1]).toHaveStyle({ backgroundColor: '#1497c6' });
  });

  it('does not invent a colour for a colour without a hex', async () => {
    renderPage([{ ...tee, colors: [{ code: 'X', name: 'Mystery', hex: null }] }]);
    const card = await cardOf('Classic Tee');

    const [dot] = within(card).getAllByTestId('product-colour');
    expect(dot).toHaveAttribute('title', 'Mystery');
    expect(dot.getAttribute('style') ?? '').not.toContain('background-color');
  });

  it('says the image is not available, with no stand-in picture, when the product has no photo', async () => {
    renderPage([tee]);
    const card = await cardOf('Classic Tee');

    expect(within(card).getByText('Image not available')).toBeInTheDocument();
    expect(card.querySelector('img[src*="product-fallback"]')).toBeNull();
  });

  it('shows no stand-in picture on the preview cards of an empty catalogue', async () => {
    const { container } = renderPage([]);

    await screen.findByText('Classic Tee');
    expect(screen.getAllByText('Image not available')).toHaveLength(3);
    expect(container.querySelector('img[src*="product-fallback"]')).toBeNull();
  });

  it('shows the product photo when it has one', async () => {
    renderPage([
      { ...tee, productImageRoles: [{ image: { url: '/photo.png', altText: 'Red tee front' } }] },
    ]);
    const card = await cardOf('Classic Tee');

    expect(within(card).getByRole('img', { name: 'Red tee front' })).toHaveAttribute(
      'src',
      '/photo.png'
    );
    expect(within(card).queryByText('Image not available')).not.toBeInTheDocument();
  });

  it('shows the size range', async () => {
    renderPage([tee]);
    const card = await cardOf('Classic Tee');

    expect(within(card).getByText('S-5XL')).toBeInTheDocument();
  });

  it('writes the price line from the real bulk tier', async () => {
    renderPage([tee]);
    const card = await cardOf('Classic Tee');

    expect(within(card).getByText('NGN 3800 each for 30 items')).toBeInTheDocument();
    expect(within(card).queryByText(/for T-Shirts/)).not.toBeInTheDocument();
  });

  it('falls back to the base price when there is no tier', async () => {
    renderPage([{ ...tee, bulkTier: null }]);
    const card = await cardOf('Classic Tee');

    expect(within(card).getByText('NGN 5000 each')).toBeInTheDocument();
  });

  it('asks for a quote, not the tier price, when the product has no base price', async () => {
    renderPage([{ ...tee, prices: [] }]);
    const card = await cardOf('Classic Tee');

    expect(within(card).getByText('Quote on request')).toBeInTheDocument();
    expect(within(card).queryByText(/each for/)).not.toBeInTheDocument();
  });

  it('labels each colour for screen readers', async () => {
    renderPage([tee]);
    const card = await cardOf('Classic Tee');

    expect(within(card).getByRole('img', { name: 'Red' })).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Blue' })).toBeInTheDocument();
  });

  it('shows "No Minimum" and never the description', async () => {
    renderPage([tee]);
    const card = await cardOf('Classic Tee');

    expect(within(card).getByText('No Minimum')).toBeInTheDocument();
    expect(within(card).queryByText(/long description/)).not.toBeInTheDocument();
  });

  it('never shows a "Best Seller" tag', async () => {
    renderPage([tee, bareProduct]);
    await cardOf('Classic Tee');

    expect(screen.queryByText(/best seller/i)).not.toBeInTheDocument();
  });

  it('still renders a product without colours, sizes, tier or price', async () => {
    renderPage([bareProduct]);
    const card = await cardOf('Bare Cap');

    expect(within(card).queryAllByTestId('product-colour')).toHaveLength(0);
    expect(within(card).getByText('Quote on request')).toBeInTheDocument();
    expect(within(card).getByText('No Minimum')).toBeInTheDocument();
  });

  it('makes the whole card one link to the product page, with no buttons (TTW-253)', async () => {
    renderPage([tee]);
    const card = await cardOf('Classic Tee');

    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('View product: Classic Tee');
    expect(links[0]).toHaveAttribute('href', '/dashboard/products/p1');
    expect(within(card).queryByRole('link', { name: 'Go to cart' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the size range next to the name (TTW-253)', async () => {
    renderPage([tee]);
    const card = await cardOf('Classic Tee');

    const nameLine = within(card).getByText('Classic Tee').parentElement as HTMLElement;
    expect(within(nameLine).getByText('S-5XL')).toBeInTheDocument();
  });
});
