/**
 * The sign-in form: the password can be shown or hidden, and "Forgot password?" leads to the
 * reset page of the public site (TTW-089).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '@/app/auth/login/page';
import { authApi } from '@/lib/auth';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/lib/auth', () => ({
  authApi: { login: jest.fn() },
  getGoogleSignInUrl: () => '/google',
  GOOGLE_SIGN_IN_ERROR_MESSAGES: {},
}));

const login = authApi.login as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('LoginPage', () => {
  it('hides the password by default and shows it on the eye button', () => {
    render(<LoginPage />);
    const password = screen.getByLabelText(/^password/i);
    expect(password).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('keeps what was typed when the password is shown or hidden', () => {
    render(<LoginPage />);
    const password = screen.getByLabelText(/^password/i);
    fireEvent.change(password, { target: { value: 'KeepMe123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveValue('KeepMe123!');
  });

  it('does not submit the form when the eye button is pressed', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(login).not.toHaveBeenCalled();
  });

  it('signs in and opens the dashboard', async () => {
    login.mockResolvedValue({ user: { id: 'u1' } });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'Secret123!' });
  });

  it('links "Forgot password?" to the reset page of the public site', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /forgot password\?/i })).toHaveAttribute(
      'href',
      'http://localhost:3000/auth/forgot-password'
    );
  });
});
