/**
 * TTW-260: the sidebar belongs to the dashboard layout, so it survives navigation.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@tamiym/ui';
import { authApi } from '@/lib/auth';
import DashboardLayout from '@/app/dashboard/layout';

const push = jest.fn();
let pathname: string | null = '/dashboard/products';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));
jest.mock('@/lib/auth', () => ({
  authApi: { getMe: jest.fn(), logout: jest.fn(), resendVerification: jest.fn() },
}));
jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));

const getMe = authApi.getMe as jest.Mock;
const user = { id: 'u1', email: 'ada@example.com', firstName: 'Ada', role: 'CUSTOMER' };

function tree(child: string) {
  return (
    <TooltipProvider>
      <DashboardLayout>
        <p>{child}</p>
      </DashboardLayout>
    </TooltipProvider>
  );
}

function renderLayout(child: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{tree(child)}</QueryClientProvider>);
  return {
    rerenderWith: (next: string) =>
      view.rerender(<QueryClientProvider client={client}>{tree(next)}</QueryClientProvider>),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  pathname = '/dashboard/products';
});

describe('dashboard layout', () => {
  it('renders the sidebar once with the user name and keeps it across page changes', async () => {
    getMe.mockResolvedValue(user);
    const { rerenderWith } = renderLayout('first page');
    expect(screen.getByText('first page')).toBeInTheDocument();
    await screen.findByText('Ada');
    const aside = document.querySelector('aside');
    expect(aside).not.toBeNull();
    aside?.setAttribute('data-test-mark', 'kept');

    pathname = '/dashboard/cart';
    rerenderWith('second page');
    expect(screen.getByText('second page')).toBeInTheDocument();
    expect(document.querySelector('aside')?.getAttribute('data-test-mark')).toBe('kept');
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('marks the menu entry that matches the URL', async () => {
    getMe.mockResolvedValue(user);
    pathname = '/dashboard/orders/abc';
    renderLayout('orders');
    await screen.findByText('Ada');
    const active = screen.getByRole('link', { name: 'Orders' }).firstElementChild;
    expect(active?.className).toContain('bg-white');
  });

  it('shows a placeholder, never a name, while the user is loading', () => {
    getMe.mockReturnValue(new Promise(() => undefined));
    renderLayout('page');
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-user-loading')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the login page once', async () => {
    getMe.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });
    renderLayout('page');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('shows one error screen with a retry that recovers', async () => {
    getMe.mockRejectedValue({ statusCode: 500, message: 'Server is down' });
    renderLayout('page');
    // a non-401 error is retried once before the screen appears
    expect(await screen.findByText('Server is down', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(document.querySelector('aside')).toBeNull();

    getMe.mockResolvedValue(user);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await screen.findByText('Ada');
    expect(screen.queryByText('Server is down')).not.toBeInTheDocument();
  });

  it('puts the workshop pages inside the sidebar, with Design as the current page (TTW-105)', async () => {
    getMe.mockResolvedValue(user);
    pathname = '/dashboard/design/new/prod-1';
    renderLayout('Editor goes here');
    expect(screen.getByText('Editor goes here')).toBeInTheDocument();
    for (const name of ['Home', 'Products', 'Design', 'Orders', 'Fundraiser']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Design' }).firstElementChild?.className).toContain(
      'bg-white'
    );
    await screen.findByText('Ada');
  });
});

describe('dashboard layout profile picture (TTW-263)', () => {
  it('shows the picture of the signed-in user in the sidebar', async () => {
    getMe.mockResolvedValue({ ...user, avatarVersion: 'v7' });
    renderLayout('page');
    await screen.findByText('Ada');
    const img = document.querySelector('aside img[src*="/users/profile/avatar"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('v=v7');
  });

  it('keeps the initials when the user has no picture', async () => {
    getMe.mockResolvedValue(user);
    renderLayout('page');
    await screen.findByText('Ada');
    expect(document.querySelector('aside img[src*="/users/profile/avatar"]')).toBeNull();
    expect(screen.getByText('AD')).toBeInTheDocument();
  });
});
