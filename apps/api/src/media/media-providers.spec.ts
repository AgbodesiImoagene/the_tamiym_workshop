import { ClamAvTcpScanner } from './scanners/clamav-tcp.scanner';
import { DeterministicScanner } from './scanners/deterministic.scanner';
import {
  createSafeRemoteMediaFetcher,
  createVirusScanner,
} from './media-providers';

describe('createVirusScanner', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns DeterministicScanner by default outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VIRUS_SCANNER;
    expect(createVirusScanner()).toBeInstanceOf(DeterministicScanner);
  });

  it('returns ClamAvTcpScanner when VIRUS_SCANNER=clamav', () => {
    process.env.NODE_ENV = 'development';
    process.env.VIRUS_SCANNER = 'clamav';
    expect(createVirusScanner()).toBeInstanceOf(ClamAvTcpScanner);
  });

  it('returns ClamAvTcpScanner in production when CLAMAV_HOST is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = 'clamav.internal';
    delete process.env.VIRUS_SCANNER;
    expect(createVirusScanner()).toBeInstanceOf(ClamAvTcpScanner);
  });

  it('throws in production when CLAMAV_HOST is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CLAMAV_HOST;
    delete process.env.VIRUS_SCANNER;
    expect(() => createVirusScanner()).toThrow(/CLAMAV_HOST is required/);
  });

  it('forbids deterministic mode in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = 'clamav.internal';
    process.env.VIRUS_SCANNER = 'deterministic';
    expect(() => createVirusScanner()).toThrow(/forbidden in production/);
  });

  it('forbids unavailable mode in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = 'clamav.internal';
    process.env.VIRUS_SCANNER = 'unavailable';
    expect(() => createVirusScanner()).toThrow(/forbidden in production/);
  });
});

describe('createSafeRemoteMediaFetcher', () => {
  it('wires onDenied to observability.recordMediaFetchDenied', () => {
    const recordMediaFetchDenied = jest.fn();
    const fetcher = createSafeRemoteMediaFetcher({
      recordMediaFetchDenied,
    } as never);
    // Reach private deny via invalid URL
    return expect(fetcher.fetch('not-a-url'))
      .rejects.toMatchObject({
        reason: 'invalid_url',
      })
      .then(() => {
        expect(recordMediaFetchDenied).toHaveBeenCalledWith({
          reason: 'invalid_url',
        });
      });
  });
});
