import { ConfigService } from '@nestjs/config';
import { GoogleOAuthService } from './google-oauth.service';

const getToken = jest.fn();
const verifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    getToken,
    verifyIdToken,
  })),
}));

describe('GoogleOAuthService.exchangeCodeForProfile (TTW-082)', () => {
  const config = {
    get: jest.fn((key: string) => `value-of-${key}`),
    getOrThrow: jest.fn((key: string) => `value-of-${key}`),
  } as unknown as ConfigService;
  const service = new GoogleOAuthService(config);

  function googleReturns(payload: Record<string, unknown>) {
    getToken.mockResolvedValue({ tokens: { id_token: 'id-token' } });
    verifyIdToken.mockResolvedValue({ getPayload: () => payload });
  }

  afterEach(() => jest.clearAllMocks());

  it('marks the email confirmed only when Google says email_verified: true', async () => {
    googleReturns({ sub: 's-1', email: 'a@example.com', email_verified: true });

    await expect(service.exchangeCodeForProfile('code')).resolves.toMatchObject(
      { providerAccountId: 's-1', email: 'a@example.com', emailVerified: true },
    );
  });

  it('marks the email unconfirmed when Google says email_verified: false', async () => {
    googleReturns({
      sub: 's-2',
      email: 'b@example.com',
      email_verified: false,
    });

    await expect(service.exchangeCodeForProfile('code')).resolves.toMatchObject(
      { emailVerified: false },
    );
  });

  it('treats a missing email_verified claim as unconfirmed', async () => {
    googleReturns({ sub: 's-3', email: 'c@example.com' });

    await expect(service.exchangeCodeForProfile('code')).resolves.toMatchObject(
      { emailVerified: false },
    );
  });

  it('treats a non-boolean email_verified claim as unconfirmed', async () => {
    googleReturns({
      sub: 's-4',
      email: 'd@example.com',
      email_verified: 'true',
    });

    await expect(service.exchangeCodeForProfile('code')).resolves.toMatchObject(
      { emailVerified: false },
    );
  });
});
