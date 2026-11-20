/**
 * TTW-090: while the account email is unverified, the customer app shows a banner
 * with a resend action. The API stays the authority for the verified state.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EmailVerificationBanner,
  EmailVerificationNotice,
} from '@/components/email-verification-banner';
import { authApi } from '@/lib/auth';

jest.mock('@/lib/auth', () => ({
  authApi: { getMe: jest.fn(), resendVerification: jest.fn() },
}));

const getMe = authApi.getMe as jest.Mock;
const resend = authApi.resendVerification as jest.Mock;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseUser = { id: 'u1', email: 'ada@example.com', role: 'CUSTOMER' };

beforeEach(() => jest.clearAllMocks());

describe('EmailVerificationBanner', () => {
  it('shows the banner when the API says the email is not verified', async () => {
    getMe.mockResolvedValue({ ...baseUser, emailVerified: false });
    renderWithQuery(<EmailVerificationBanner />);
    expect(await screen.findByRole('status')).toHaveTextContent(/verify your email/i);
    expect(screen.getByRole('button', { name: /resend/i })).toBeEnabled();
  });

  it('renders nothing when the email is verified', async () => {
    getMe.mockResolvedValue({ ...baseUser, emailVerified: true });
    renderWithQuery(<EmailVerificationBanner />);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('hides itself when the user verifies elsewhere and comes back to this tab', async () => {
    getMe.mockResolvedValueOnce({ ...baseUser, emailVerified: false });
    renderWithQuery(<EmailVerificationBanner />);
    expect(await screen.findByRole('status')).toBeInTheDocument();

    getMe.mockResolvedValue({ ...baseUser, emailVerified: true });
    act(() => {
      // react-query's focus manager listens for `visibilitychange` on window.
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('renders nothing when the user cannot be loaded', async () => {
    getMe.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });
    renderWithQuery(<EmailVerificationBanner />);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('EmailVerificationNotice resend', () => {
  it('sends the link to the account email and confirms', async () => {
    resend.mockResolvedValue({ message: 'ok' });
    render(<EmailVerificationNotice email="ada@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: /resend/i }));
    expect(await screen.findByText(/we sent a new link/i)).toBeInTheDocument();
    expect(resend).toHaveBeenCalledWith('ada@example.com');
  });

  it('disables the button while the request is in flight', async () => {
    let done!: () => void;
    resend.mockReturnValue(new Promise<void>((r) => (done = r)));
    render(<EmailVerificationNotice email="ada@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: /resend/i }));
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    done();
    await screen.findByText(/we sent a new link/i);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it('sends only one request when the button is clicked twice in a row', async () => {
    let done!: () => void;
    resend.mockReturnValue(new Promise<void>((r) => (done = r)));
    render(<EmailVerificationNotice email="ada@example.com" />);
    const button = screen.getByRole('button', { name: /resend/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(resend).toHaveBeenCalledTimes(1);
    done();
    await screen.findByText(/we sent a new link/i);
  });

  it('waits before offering another resend, then enables the button again', async () => {
    jest.useFakeTimers();
    try {
      resend.mockResolvedValue({ message: 'ok' });
      render(<EmailVerificationNotice email="ada@example.com" />);
      fireEvent.click(screen.getByRole('button', { name: /resend/i }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /resend in \d+s/i })).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });
      expect(screen.getByRole('button', { name: 'Resend link' })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('explains the throttle (429) and lets the user retry later', async () => {
    resend.mockRejectedValue({ statusCode: 429, message: 'Too many requests' });
    render(<EmailVerificationNotice email="ada@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: /resend/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many|wait/i);
    expect(screen.getByRole('button', { name: /resend/i })).toBeEnabled();
  });

  it('shows a generic error for any other failure', async () => {
    resend.mockRejectedValue({ statusCode: 500, message: 'boom' });
    render(<EmailVerificationNotice email="ada@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: /resend/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send/i);
  });
});
