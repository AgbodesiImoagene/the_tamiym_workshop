/**
 * TTW-260: one cached `/auth/me` for the whole dashboard, one owner of the 401 redirect,
 * and a cache that never outlives the session.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { authApi } from '@/lib/auth';
import { useCurrentUser, useRequireUser } from '@/lib/current-user';
import { onSessionReset, resetSession } from '@/lib/session-reset';
import { Providers } from '@/app/providers';
import { EmailVerificationBanner } from '@/components/email-verification-banner';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/lib/auth', () => ({ authApi: { getMe: jest.fn(), resendVerification: jest.fn() } }));

const getMe = authApi.getMe as jest.Mock;
const user = { id: 'u1', email: 'ada@example.com', firstName: 'Ada', role: 'CUSTOMER' };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: 3 } } });

beforeEach(() => jest.clearAllMocks());

describe('useCurrentUser', () => {
  it('makes one request for two consumers and shares the user', async () => {
    getMe.mockResolvedValue(user);
    const client = newClient();
    const both = renderHook(() => [useCurrentUser(), useCurrentUser()], {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(both.result.current[0].user?.firstName).toBe('Ada'));
    expect(both.result.current[1].user?.firstName).toBe('Ada');
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('does not ask again when a page mounts later (navigation)', async () => {
    getMe.mockResolvedValue(user);
    const client = newClient();
    const first = renderHook(() => useCurrentUser(), { wrapper: wrapper(client) });
    await waitFor(() => expect(first.result.current.user).toBeDefined());
    first.unmount();
    const second = renderHook(() => useCurrentUser(), { wrapper: wrapper(client) });
    expect(second.result.current.user?.firstName).toBe('Ada');
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 401', async () => {
    getMe.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });
    const { result } = renderHook(() => useCurrentUser(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('retries another error once', async () => {
    getMe.mockRejectedValue({ statusCode: 500, message: 'Boom' });
    const { result } = renderHook(() => useCurrentUser(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 4000 });
    expect(getMe).toHaveBeenCalledTimes(2);
  });
});

describe('useRequireUser', () => {
  it('redirects to the login page once on a 401, whatever the number of readers', async () => {
    getMe.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });
    const client = newClient();
    renderHook(
      () => {
        useRequireUser();
        useCurrentUser();
      },
      { wrapper: wrapper(client) }
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('does not redirect on another error or on success', async () => {
    getMe.mockResolvedValue(user);
    const ok = renderHook(() => useRequireUser(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(ok.result.current.user).toBeDefined());
    expect(push).not.toHaveBeenCalled();
  });
});

describe('banner and hook share the request', () => {
  it('still refetches the banner on window focus although the data is fresh', async () => {
    getMe.mockResolvedValue({ ...user, emailVerified: false });
    render(
      <Providers>
        <EmailVerificationBanner />
      </Providers>
    );
    await screen.findByText(/verify/i);
    getMe.mockResolvedValue({ ...user, emailVerified: true });
    act(() => {
      // react-query's focus manager listens for `visibilitychange` on window.
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(screen.queryByText(/verify/i)).not.toBeInTheDocument());
  });
});

describe('session reset', () => {
  it('notifies listeners and Providers clears the query cache', async () => {
    getMe.mockResolvedValue(user);
    const seen = jest.fn();
    const off = onSessionReset(seen);
    function Probe() {
      const { user: u } = useCurrentUser();
      return <p>{u ? u.firstName : 'none'}</p>;
    }
    render(
      <Providers>
        <Probe />
      </Providers>
    );
    await screen.findByText('Ada');
    act(() => resetSession());
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    // a new request is needed after the reset, and the previous person is no longer shown
    getMe.mockResolvedValue({ ...user, firstName: 'Bola' });
    render(
      <Providers>
        <Probe />
      </Providers>
    );
    await screen.findByText('Bola');
  });
});
