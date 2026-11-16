/**
 * TTW-089: rules for the forgot-password and reset-password pages.
 * The screens are covered by Playwright; the form rules and the way an API
 * failure is shown live in lib/password-reset.ts so they can be tested here.
 */
import {
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  classifyResetError,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../lib/password-reset';

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
  });

  it('rejects an empty or malformed email', () => {
    expect(forgotPasswordSchema.safeParse({ email: '' }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('FORGOT_PASSWORD_SUCCESS_MESSAGE', () => {
  it('never says whether the account exists', () => {
    expect(FORGOT_PASSWORD_SUCCESS_MESSAGE).toMatch(/if an account exists/i);
    expect(FORGOT_PASSWORD_SUCCESS_MESSAGE).not.toMatch(/no account|not found|does not exist/i);
  });
});

describe('resetPasswordSchema', () => {
  const valid = { newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' };

  it('accepts a strong password that matches its confirmation', () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['too short', 'Aa1!aaa'],
    ['no uppercase', 'newpassword123!'],
    ['no lowercase', 'NEWPASSWORD123!'],
    ['no number', 'NewPassword!!!'],
    ['no symbol', 'NewPassword123'],
  ])('rejects a password with %s', (_label, password) => {
    const result = resetPasswordSchema.safeParse({
      newPassword: password,
      confirmPassword: password,
    });
    expect(result.success).toBe(false);
  });

  it.each(['Password1€', 'Pässword1x', 'Password1😀'])(
    'rejects %s: the API does not count that character as a symbol',
    (password) => {
      expect(
        resetPasswordSchema.safeParse({ newPassword: password, confirmPassword: password }).success
      ).toBe(false);
    }
  );

  it('accepts the symbols the API accepts, including a space', () => {
    for (const symbol of ['-', '#', '!', '$', '@', '£', '%', '^', '&', '*', ' ', '\\', '/']) {
      const password = `Passw0rd${symbol}`;
      expect(
        resetPasswordSchema.safeParse({ newPassword: password, confirmPassword: password }).success
      ).toBe(true);
    }
  });

  it('rejects a confirmation that differs, on the confirm field', () => {
    const result = resetPasswordSchema.safeParse({ ...valid, confirmPassword: 'Other123!abc' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('confirmPassword');
    }
  });
});

describe('classifyResetError', () => {
  it('treats the stable INVALID_RESET_TOKEN code as an expired or invalid link', () => {
    expect(
      classifyResetError({
        statusCode: 400,
        code: 'INVALID_RESET_TOKEN',
        message: 'Invalid or expired reset token',
      })
    ).toBe('invalid-link');
  });

  it('does not rely on the wording: a reworded message with the code is still a bad link', () => {
    expect(
      classifyResetError({ statusCode: 400, code: 'INVALID_RESET_TOKEN', message: 'Nope' })
    ).toBe('invalid-link');
  });

  it('does not treat a 400 mentioning a token, but without the code, as a bad link', () => {
    expect(classifyResetError({ statusCode: 400, message: 'token is required' })).toBe(
      'password-rejected'
    );
  });

  it('does not call a rejected password an expired link', () => {
    expect(
      classifyResetError({ statusCode: 400, message: 'newPassword is not strong enough' })
    ).toBe('password-rejected');
  });

  it('treats a 429 as rate limited', () => {
    expect(classifyResetError({ statusCode: 429, message: 'Too Many Requests' })).toBe(
      'rate-limited'
    );
  });

  it('treats anything else, including non-API errors, as unexpected', () => {
    expect(classifyResetError({ statusCode: 500, message: 'boom' })).toBe('unexpected');
    expect(classifyResetError(new Error('network down'))).toBe('unexpected');
    expect(classifyResetError(null)).toBe('unexpected');
  });
});
