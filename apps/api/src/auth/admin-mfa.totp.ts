import { Secret, TOTP } from 'otpauth';

/** Allow ±1 TOTP step for mild clock skew. */
export const MFA_TOTP_WINDOW = 1;

export const MFA_TOTP_ISSUER = 'Tamiym Workshop Admin';

function buildTotp(secretBase32: string, label = 'admin'): TOTP {
  return new TOTP({
    issuer: MFA_TOTP_ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** Generate a new base32 TOTP shared secret. */
export function mintTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** Build an otpauth:// URI for authenticator apps. */
export function buildTotpUri(secret: string, accountEmail: string): string {
  return buildTotp(secret, accountEmail).toString();
}

/** Verify a 6-digit TOTP against a shared secret (±1 step window). */
export function verifyTotpCode(token: string, secret: string): boolean {
  const normalized = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }
  try {
    const delta = buildTotp(secret).validate({
      token: normalized,
      window: MFA_TOTP_WINDOW,
    });
    return delta !== null;
  } catch {
    return false;
  }
}

/** Generate the current TOTP (tests / enrollment helpers only). */
export function generateTotpCode(secret: string): string {
  return buildTotp(secret).generate();
}
