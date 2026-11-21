/** TTW-058: "My Designs" offers to order each design that was not rejected. */
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardDesignPage from '@/app/dashboard/design/page';
import { getMyDesigns, type Design } from '@/lib/designs';
import { getDashboardProducts } from '@/lib/products';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
jest.mock('@/components/customer-dashboard-shell', () => ({
  CustomerDashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/lib/auth', () => ({
  authApi: { getMe: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@example.com' }) },
}));
jest.mock('@/lib/designs', () => ({
  getMyDesigns: jest.fn(),
  deleteDesign: jest.fn(),
  duplicateDesign: jest.fn(),
}));
jest.mock('@/lib/products', () => ({ getDashboardProducts: jest.fn() }));

function design(id: string, moderationStatus: Design['moderationStatus']): Design {
  return {
    id,
    productId: 'p1',
    name: `Design ${id}`,
    designData: {} as Design['designData'],
    moderationStatus,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    product: { id: 'p1', name: 'Classic Tee', slug: 'classic-tee' },
  };
}

it('links each design that can be ordered to its product, and not a rejected one', async () => {
  jest
    .mocked(getMyDesigns)
    .mockResolvedValue([design('a', 'APPROVED'), design('b', 'PENDING'), design('c', 'REJECTED')]);
  jest.mocked(getDashboardProducts).mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardDesignPage />
    </QueryClientProvider>
  );

  const approved = (await screen.findByText('Design a')).closest('article') as HTMLElement;
  expect(within(approved).getByRole('link', { name: 'Order' })).toHaveAttribute(
    'href',
    '/dashboard/products/p1?designId=a'
  );
  const pending = screen.getByText('Design b').closest('article') as HTMLElement;
  expect(within(pending).getByRole('link', { name: 'Order' })).toHaveAttribute(
    'href',
    '/dashboard/products/p1?designId=b'
  );
  const rejected = screen.getByText('Design c').closest('article') as HTMLElement;
  expect(within(rejected).queryByRole('link', { name: 'Order' })).not.toBeInTheDocument();
});
