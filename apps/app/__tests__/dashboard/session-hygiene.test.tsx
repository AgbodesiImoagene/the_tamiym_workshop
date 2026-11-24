/**
 * TTW-260: the cached user must never outlive the session. These tests use the real `authApi`
 * and the real `Providers` (only the HTTP client is mocked).
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import { Providers } from '@/app/providers';
import DashboardLayout from '@/app/dashboard/layout';
import { authApi } from '@/lib/auth';
import { apiClient, clearCsrfToken, setCsrfToken } from '@/lib/api';
import { onSessionReset } from '@/lib/session-reset';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard',
}));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  apiClient: { get: jest.fn(), post: jest.fn() },
  setCsrfToken: jest.fn(),
  clearCsrfToken: jest.fn(),
}));

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const ada = { id: 'u1', email: 'ada@example.com', firstName: 'Ada', role: 'CUSTOMER' };
const bola = { id: 'u2', email: 'bola@example.com', firstName: 'Bola', role: 'CUSTOMER' };

function layout() {
  return (
    <Providers>
      <TooltipProvider>
        <DashboardLayout>
          <p>page</p>
        </DashboardLayout>
      </TooltipProvider>
    </Providers>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('session changes reset the shared state', () => {
  it.each([
    ['login', () => authApi.login({ email: 'a@b.co', password: 'x' })],
    ['register', () => authApi.register({ email: 'a@b.co', password: 'x' })],
    ['signupVerify', () => authApi.signupVerify('token', '123456')],
  ])('%s resets the session and stores the new CSRF token', async (_name, call) => {
    post.mockResolvedValue({ user: bola, csrf_token: 'csrf-b' });
    const reset = jest.fn();
    const off = onSessionReset(reset);
    await call();
    off();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setCsrfToken).toHaveBeenCalledWith('csrf-b');
  });

  it('logout clears the CSRF token and resets the session, even when the API call fails', async () => {
    post.mockRejectedValue(new Error('network'));
    const reset = jest.fn();
    const off = onSessionReset(reset);
    await expect(authApi.logout()).rejects.toThrow('network');
    off();
    expect(clearCsrfToken).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('dashboard layout with the real cache', () => {
  it('after logout and a login as someone else, the first screen shows the new name', async () => {
    get.mockResolvedValue(ada);
    const first = render(layout());
    await screen.findByText('Ada');
    first.unmount();

    post.mockResolvedValue({});
    await act(async () => {
      await authApi.logout();
    });
    post.mockResolvedValue({ user: bola, csrf_token: 'csrf-b' });
    get.mockResolvedValue(bola);
    await act(async () => {
      await authApi.login({ email: 'bola@example.com', password: 'x' });
    });

    render(layout());
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
    await screen.findByText('Bola');
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
  });

  it('on a 401 asks the API once and redirects once, with the real cache clearing', async () => {
    get.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });
    const view = render(layout());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
    // let any re-render settle: no second request, no second redirect
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);

    // then a login: the dashboard shows the signed-in person and does not bounce to the login
    view.unmount();
    post.mockResolvedValue({ user: bola, csrf_token: 'csrf-b' });
    get.mockResolvedValue(bola);
    await act(async () => {
      await authApi.login({ email: 'bola@example.com', password: 'x' });
    });
    render(layout());
    await screen.findByText('Bola');
    expect(push).toHaveBeenCalledTimes(1);
  });
});
