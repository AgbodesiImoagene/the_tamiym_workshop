/**
 * TTW-254: the sign-up form no longer signs anyone in. It starts the sign-up, then the code screen
 * takes over; the dashboard opens only after the API accepts the code.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RegisterPage from '@/app/auth/register/page';
import { authApi } from '@/lib/auth';
import { clearPendingSignup } from '@/lib/signup-session';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/lib/auth', () => ({
  authApi: { signupStart: jest.fn(), signupVerify: jest.fn(), signupResend: jest.fn() },
  getGoogleSignInUrl: () => '/google',
  GOOGLE_SIGN_IN_ERROR_MESSAGES: {},
}));

const start = authApi.signupStart as jest.Mock;
const verify = authApi.signupVerify as jest.Mock;

const TOKEN = 'b'.repeat(64);

function fillForm() {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: 'ada@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Lovelace' } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'SignupPassword1!' } });
  fireEvent.change(screen.getByLabelText(/^confirm password/i), {
    target: { value: 'SignupPassword1!' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // The in-memory copy outlives a single render, so clear it as well as the storage.
  clearPendingSignup();
  window.sessionStorage.clear();
});

describe('RegisterPage', () => {
  it('starts the sign-up and shows the code screen without signing anyone in', async () => {
    start.mockResolvedValue({ message: 'sent', signupToken: TOKEN });
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send confirmation code/i }));

    expect(await screen.findByLabelText(/confirmation code/i)).toBeInTheDocument();
    expect(start).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'SignupPassword1!',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(push).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('ttw_signup_token')).toBe(TOKEN);
  });

  it('keeps the person on the form when the start is refused', async () => {
    start.mockRejectedValue({ statusCode: 429, message: 'Too many requests. Try again later.' });
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send confirmation code/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/confirmation code/i)).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('ttw_signup_token')).toBeNull();
  });

  it('explains an unavailable service without showing the raw API message', async () => {
    start.mockRejectedValue({ statusCode: 503, message: 'Too many requests. Try again later.' });
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send confirmation code/i }));

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/too many requests/i)).not.toBeInTheDocument();
  });

  it('opens the dashboard only once the code is accepted, and forgets the token', async () => {
    start.mockResolvedValue({ message: 'sent', signupToken: TOKEN });
    verify.mockResolvedValue({ user: { id: 'u1' } });
    render(<RegisterPage />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send confirmation code/i }));
    fireEvent.change(await screen.findByLabelText(/confirmation code/i), {
      target: { value: '123456' },
    });
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(verify).toHaveBeenCalledWith(TOKEN, '123456');
    expect(window.sessionStorage.getItem('ttw_signup_token')).toBeNull();
  });

  it('returns to the code screen after a page reload while a sign-up is waiting', () => {
    window.sessionStorage.setItem('ttw_signup_token', TOKEN);
    window.sessionStorage.setItem('ttw_signup_email', 'ada@example.com');
    render(<RegisterPage />);
    expect(screen.getByLabelText(/confirmation code/i)).toBeInTheDocument();
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument();
  });

  it('goes back to an empty form when the person chooses a different email', async () => {
    window.sessionStorage.setItem('ttw_signup_token', TOKEN);
    window.sessionStorage.setItem('ttw_signup_email', 'ada@example.com');
    render(<RegisterPage />);
    fireEvent.click(screen.getByRole('button', { name: /different email/i }));

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(window.sessionStorage.getItem('ttw_signup_token')).toBeNull();
  });

  describe('password confirmation and visibility', () => {
    it('refuses a confirmation that differs from the password, and sends nothing', async () => {
      render(<RegisterPage />);
      fillForm();
      fireEvent.change(screen.getByLabelText(/^confirm password/i), {
        target: { value: 'SomethingElse1!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /send confirmation code/i }));

      expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
      expect(start).not.toHaveBeenCalled();
    });

    it('requires the confirmation to be filled in', async () => {
      render(<RegisterPage />);
      fillForm();
      fireEvent.change(screen.getByLabelText(/^confirm password/i), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /send confirmation code/i }));

      expect(await screen.findByText(/confirm your password/i)).toBeInTheDocument();
      expect(start).not.toHaveBeenCalled();
    });

    it('does not send the confirmation to the API', async () => {
      start.mockResolvedValue({ message: 'sent', signupToken: TOKEN });
      render(<RegisterPage />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /send confirmation code/i }));
      await screen.findByLabelText(/confirmation code/i);
      expect(start.mock.calls[0][0]).not.toHaveProperty('confirmPassword');
    });

    it('hides both passwords by default and shows each one on its own icon', () => {
      render(<RegisterPage />);
      const password = screen.getByLabelText(/^password/i);
      const confirm = screen.getByLabelText(/^confirm password/i);
      expect(password).toHaveAttribute('type', 'password');
      expect(confirm).toHaveAttribute('type', 'password');

      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(password).toHaveAttribute('type', 'text');
      expect(confirm).toHaveAttribute('type', 'password');
      expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));
      expect(confirm).toHaveAttribute('type', 'text');

      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(password).toHaveAttribute('type', 'password');
    });

    it('keeps what was typed when the password is shown or hidden', () => {
      render(<RegisterPage />);
      const password = screen.getByLabelText(/^password/i);
      fireEvent.change(password, { target: { value: 'KeepMe123!' } });
      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(password).toHaveValue('KeepMe123!');
    });
  });
});
