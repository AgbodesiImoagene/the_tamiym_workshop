/**
 * TTW-254: after the sign-up form, the person enters the 6-digit code emailed to them. Only the
 * API's answer to that code signs them in; the screen never navigates on its own.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SignupCodeForm } from '@/components/signup-code-form';
import { authApi } from '@/lib/auth';

jest.mock('@/lib/auth', () => ({
  authApi: { signupVerify: jest.fn(), signupResend: jest.fn() },
}));

const verify = authApi.signupVerify as jest.Mock;
const resend = authApi.signupResend as jest.Mock;

const TOKEN = 'a'.repeat(64);
const onConfirmed = jest.fn();
const onRestart = jest.fn();

function renderForm() {
  return render(
    <SignupCodeForm
      email="ada@example.com"
      signupToken={TOKEN}
      onConfirmed={onConfirmed}
      onRestart={onRestart}
    />
  );
}

function typeCode(value: string) {
  fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value } });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('SignupCodeForm', () => {
  it('says where the code was sent', () => {
    renderForm();
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmation code/i)).toHaveAttribute(
      'autocomplete',
      'one-time-code'
    );
  });

  it('puts the cursor in the code field when the screen opens', () => {
    renderForm();
    expect(screen.getByLabelText(/confirmation code/i)).toHaveFocus();
  });

  it('ties the validation message to the field for assistive technology', async () => {
    renderForm();
    typeCode('12');
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    const message = await screen.findByText(/enter the 6-digit code/i);
    expect(screen.getByLabelText(/confirmation code/i)).toHaveAttribute(
      'aria-describedby',
      message.id
    );
  });

  it('refuses anything but six digits without calling the API', async () => {
    renderForm();
    typeCode('12ab');
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument();
    expect(verify).not.toHaveBeenCalled();
  });

  it('sends the code with the sign-up token and reports success', async () => {
    verify.mockResolvedValue({ user: { id: 'u1' } });
    renderForm();
    typeCode('123456');
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(verify).toHaveBeenCalledWith(TOKEN, '123456');
  });

  it('keeps the person on the screen with an explanation when the code is refused', async () => {
    verify.mockRejectedValue({ statusCode: 400, message: 'Invalid or expired code' });
    renderForm();
    typeCode('000000');
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('tells the person to wait when they are rate limited', async () => {
    verify.mockRejectedValue({ statusCode: 429, message: 'Too many requests. Try again later.' });
    renderForm();
    typeCode('123456');
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('shows a retryable message when the service is unavailable', async () => {
    verify.mockRejectedValue({ statusCode: 503, message: 'Too many requests. Try again later.' });
    renderForm();
    typeCode('123456');
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
  });

  it('disables the submit button while the code is being checked', async () => {
    let finish: (value: unknown) => void = () => undefined;
    verify.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();
    typeCode('123456');
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(await screen.findByRole('button', { name: /confirming/i })).toBeDisabled();
    await act(async () => finish({ user: {} }));
  });

  describe('resend', () => {
    it('is disabled for 60 seconds after the code was sent, with a countdown', () => {
      renderForm();
      const button = screen.getByRole('button', { name: /resend code/i });
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(/60/);
      act(() => jest.advanceTimersByTime(10_000));
      expect(screen.getByRole('button', { name: /resend code/i })).toHaveTextContent(/50/);
    });

    it('sends a new code once the wait is over, then waits again', async () => {
      resend.mockResolvedValue({ message: 'sent' });
      renderForm();
      act(() => jest.advanceTimersByTime(60_000));
      const button = screen.getByRole('button', { name: /resend code/i });
      expect(button).toBeEnabled();

      fireEvent.click(button);
      expect(await screen.findByRole('status')).toHaveTextContent(/a new code is on its way/i);
      expect(resend).toHaveBeenCalledWith(TOKEN);
      expect(screen.getByRole('button', { name: /resend code/i })).toBeDisabled();
    });

    it('explains a refused resend', async () => {
      resend.mockRejectedValue({ statusCode: 429, message: 'Too many requests. Try again later.' });
      renderForm();
      act(() => jest.advanceTimersByTime(60_000));
      fireEvent.click(screen.getByRole('button', { name: /resend code/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/wait/i);
    });
  });

  it('lets the person start over with another email', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /different email/i }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
