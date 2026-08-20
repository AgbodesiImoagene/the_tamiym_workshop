import {
  assertPublicHostnameOrIp,
  isBlockedHostname,
  SafeRemoteFetchError,
  SafeRemoteMediaFetcher,
} from './safe-remote-fetch';

jest.mock('undici', () => ({
  Agent: jest.fn().mockImplementation(() => ({
    close: jest.fn().mockResolvedValue(undefined),
  })),
  request: jest.fn(),
}));

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

import { request } from 'undici';
import * as dns from 'node:dns/promises';

describe('safe-remote-fetch host classification', () => {
  const blocked = [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fd00::1',
    '100.64.1.1',
    'localhost',
    'metadata.google.internal',
    '[::1]',
  ];

  it.each(blocked)('blocks %s', (host) => {
    expect(isBlockedHostname(host)).toBe(true);
    expect(() => assertPublicHostnameOrIp(host)).toThrow(SafeRemoteFetchError);
  });

  it('allows a public IPv4 literal', () => {
    expect(isBlockedHostname('8.8.8.8')).toBe(false);
    expect(() => assertPublicHostnameOrIp('8.8.8.8')).not.toThrow();
  });

  it('allows a public hostname (DNS checked later)', () => {
    expect(isBlockedHostname('cdn.example.com')).toBe(false);
  });

  it('blocks IPv4-mapped private addresses', () => {
    expect(isBlockedHostname('::ffff:10.0.0.1')).toBe(true);
  });
});

describe('SafeRemoteMediaFetcher', () => {
  const dnsLookup = dns.lookup as jest.MockedFunction<typeof dns.lookup>;
  const undiciRequest = request as jest.MockedFunction<typeof request>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies redirects that land on a private IP', async () => {
    dnsLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);

    undiciRequest.mockResolvedValue({
      statusCode: 302,
      headers: { location: 'http://127.0.0.1/secret.png' },
      body: { resume: jest.fn() },
    } as never);

    const onDenied = jest.fn();
    const fetcher = new SafeRemoteMediaFetcher({ onDenied });

    await expect(
      fetcher.fetch('https://example.com/image.png'),
    ).rejects.toMatchObject({
      reason: 'blocked_host',
    });
    expect(onDenied).toHaveBeenCalledWith('blocked_host');
  });

  it('denies when DNS resolves any private address', async () => {
    dnsLookup.mockResolvedValue([
      { address: '1.2.3.4', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ] as never);

    const onDenied = jest.fn();
    const fetcher = new SafeRemoteMediaFetcher({ onDenied });

    await expect(
      fetcher.fetch('https://evil.example/image.png'),
    ).rejects.toMatchObject({
      reason: 'dns_blocked',
    });
    expect(onDenied).toHaveBeenCalledWith('dns_blocked');
    expect(undiciRequest).not.toHaveBeenCalled();
  });

  it('denies content-length above maxBytes and records deny metric', async () => {
    dnsLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);

    undiciRequest.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-length': String(2 * 1024 * 1024) },
      body: { resume: jest.fn() },
    } as never);

    const onDenied = jest.fn();
    const fetcher = new SafeRemoteMediaFetcher({
      maxBytes: 1024,
      onDenied,
    });

    await expect(
      fetcher.fetch('https://example.com/huge.png'),
    ).rejects.toMatchObject({ reason: 'oversize' });
    expect(onDenied).toHaveBeenCalledWith('oversize');
  });

  it('denies when streamed body exceeds maxBytes', async () => {
    dnsLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);

    function* oversized() {
      yield Buffer.alloc(600);
      yield Buffer.alloc(600);
    }

    undiciRequest.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: oversized(),
    } as never);

    const onDenied = jest.fn();
    const fetcher = new SafeRemoteMediaFetcher({
      maxBytes: 1000,
      onDenied,
    });

    await expect(
      fetcher.fetch('https://example.com/stream.png'),
    ).rejects.toMatchObject({ reason: 'oversize' });
    expect(onDenied).toHaveBeenCalledWith('oversize');
  });

  it('denies when redirect hop count is exceeded', async () => {
    dnsLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);

    undiciRequest.mockResolvedValue({
      statusCode: 302,
      headers: { location: 'https://example.com/next.png' },
      body: { resume: jest.fn() },
    } as never);

    const onDenied = jest.fn();
    const fetcher = new SafeRemoteMediaFetcher({
      maxRedirects: 0,
      onDenied,
    });

    await expect(
      fetcher.fetch('https://example.com/image.png'),
    ).rejects.toMatchObject({ reason: 'redirect_limit' });
    expect(onDenied).toHaveBeenCalledWith('redirect_limit');
  });

  it('denies non-http(s) schemes', async () => {
    const onDenied = jest.fn();
    const fetcher = new SafeRemoteMediaFetcher({ onDenied });

    await expect(fetcher.fetch('file:///etc/passwd')).rejects.toMatchObject({
      reason: 'bad_protocol',
    });
    expect(onDenied).toHaveBeenCalledWith('bad_protocol');
    expect(undiciRequest).not.toHaveBeenCalled();
  });

  it('returns buffer for a successful public fetch', async () => {
    dnsLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);

    function* body() {
      yield Buffer.from('png-bytes');
    }

    undiciRequest.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'image/png' },
      body: body(),
    } as never);

    const fetcher = new SafeRemoteMediaFetcher({ maxBytes: 1024 });
    const result = await fetcher.fetch('https://example.com/ok.png');
    expect(result.buffer.toString()).toBe('png-bytes');
    expect(result.contentType).toBe('image/png');
  });
});
