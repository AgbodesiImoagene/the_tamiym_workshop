import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, request } from 'undici';
import { MEDIA_MAX_BYTES } from './media.constants';

export const MEDIA_FETCH_MAX_REDIRECTS = 3;
export const MEDIA_FETCH_DEFAULT_TIMEOUT_MS = 10_000;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
]);

export type SafeRemoteFetchResult = {
  buffer: Buffer;
  /** Content-Type header hint only — caller must re-identify bytes. */
  contentType: string;
};

export class SafeRemoteFetchError extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = 'SafeRemoteFetchError';
  }
}

function stripBrackets(host: string): string {
  if (host.startsWith('[') && host.endsWith(']')) {
    return host.slice(1, -1);
  }
  return host;
}

function isPublicAddress(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      return isPublicAddress(v6.toIPv4Address());
    }
  }
  return addr.range() === 'unicast';
}

/**
 * Returns true when the hostname or IP literal must never be fetched
 * (loopback, private, link-local, ULA, CGNAT, multicast, metadata, etc.).
 * Domain names that are not IP literals return false here; DNS is validated later.
 */
export function isBlockedHostname(host: string): boolean {
  const normalized = stripBrackets(host.trim().toLowerCase());
  if (!normalized) {
    return true;
  }
  if (BLOCKED_HOSTNAMES.has(normalized)) {
    return true;
  }
  if (
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  ) {
    return true;
  }

  if (net.isIP(normalized)) {
    try {
      return !isPublicAddress(ipaddr.parse(normalized));
    } catch {
      return true;
    }
  }

  return false;
}

export function assertPublicHostnameOrIp(host: string): void {
  if (isBlockedHostname(host)) {
    throw new SafeRemoteFetchError(
      `Blocked host: ${host || '(empty)'}`,
      'blocked_host',
    );
  }
}

async function resolvePublicAddresses(
  hostname: string,
): Promise<{ address: string; family: 4 | 6 }[]> {
  assertPublicHostnameOrIp(hostname);

  if (net.isIP(hostname)) {
    const addr = ipaddr.parse(hostname);
    if (!isPublicAddress(addr)) {
      throw new SafeRemoteFetchError(`Blocked IP: ${hostname}`, 'blocked_ip');
    }
    return [
      {
        address: hostname,
        family: net.isIPv6(hostname) ? 6 : 4,
      },
    ];
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SafeRemoteFetchError(
      `DNS resolve failed for ${hostname}: ${message}`,
      'dns_failed',
    );
  }

  if (!records.length) {
    throw new SafeRemoteFetchError(
      `No DNS records for ${hostname}`,
      'dns_empty',
    );
  }

  const publicRecords: { address: string; family: 4 | 6 }[] = [];
  for (const record of records) {
    try {
      const parsed = ipaddr.parse(record.address);
      if (!isPublicAddress(parsed)) {
        throw new SafeRemoteFetchError(
          `DNS for ${hostname} resolved to blocked address ${record.address}`,
          'dns_blocked',
        );
      }
      publicRecords.push({
        address: record.address,
        family: record.family === 6 ? 6 : 4,
      });
    } catch (error) {
      if (error instanceof SafeRemoteFetchError) {
        throw error;
      }
      throw new SafeRemoteFetchError(
        `DNS for ${hostname} resolved to unparseable address ${record.address}`,
        'dns_invalid',
      );
    }
  }

  return publicRecords;
}

function mediaFetchTimeoutMs(): number {
  const raw = Number(process.env.MEDIA_FETCH_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return MEDIA_FETCH_DEFAULT_TIMEOUT_MS;
}

async function readBodyWithLimit(
  body: AsyncIterable<Buffer | Uint8Array> | null,
  maxBytes: number,
): Promise<Buffer> {
  if (!body) {
    throw new SafeRemoteFetchError('Empty response body', 'empty_body');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new SafeRemoteFetchError(
        `Response exceeded ${maxBytes} bytes`,
        'oversize',
      );
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks, total);
}

function resolveRedirectUrl(current: URL, location: string | null): URL {
  if (!location || !location.trim()) {
    throw new SafeRemoteFetchError(
      'Redirect missing Location header',
      'redirect_missing_location',
    );
  }
  try {
    return new URL(location, current);
  } catch {
    throw new SafeRemoteFetchError(
      `Invalid redirect Location: ${location}`,
      'redirect_invalid',
    );
  }
}

/**
 * SSRF-safe remote media fetch: DNS resolve + public IP pin, manual redirects,
 * byte/time limits. Content-Type is a hint only.
 */
export class SafeRemoteMediaFetcher {
  constructor(
    private readonly options: {
      maxBytes?: number;
      maxRedirects?: number;
      timeoutMs?: number;
      onDenied?: (reason: string) => void;
    } = {},
  ) {}

  async fetch(url: string): Promise<SafeRemoteFetchResult> {
    return this.fetchHop(url, 0);
  }

  private deny(reason: string, message: string): never {
    this.options.onDenied?.(reason);
    throw new SafeRemoteFetchError(message, reason);
  }

  private async fetchHop(
    urlString: string,
    redirectCount: number,
  ): Promise<SafeRemoteFetchResult> {
    const maxRedirects = this.options.maxRedirects ?? MEDIA_FETCH_MAX_REDIRECTS;
    const maxBytes = this.options.maxBytes ?? MEDIA_MAX_BYTES;
    const timeoutMs = this.options.timeoutMs ?? mediaFetchTimeoutMs();

    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      this.deny('invalid_url', 'Invalid source URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      this.deny('bad_protocol', 'Unsupported URL protocol');
    }
    if (parsed.username || parsed.password) {
      this.deny('userinfo', 'URL must not include userinfo');
    }
    if (!parsed.hostname) {
      this.deny('empty_host', 'URL host is empty');
    }

    try {
      assertPublicHostnameOrIp(parsed.hostname);
    } catch (error) {
      if (error instanceof SafeRemoteFetchError) {
        this.deny(error.reason, error.message);
      }
      throw error;
    }

    let addresses: { address: string; family: 4 | 6 }[];
    try {
      addresses = await resolvePublicAddresses(stripBrackets(parsed.hostname));
    } catch (error) {
      if (error instanceof SafeRemoteFetchError) {
        this.deny(error.reason, error.message);
      }
      throw error;
    }

    const pinned = addresses[0];
    const hostnameForHeader = stripBrackets(parsed.hostname);

    const agent = new Agent({
      connect: {
        lookup: (_hostname, _options, callback) => {
          callback(null, pinned.address, pinned.family);
        },
        timeout: timeoutMs,
      },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connectTimeout: timeoutMs,
    });

    try {
      // Do not enable undici redirect interceptor — we follow Location manually
      // after re-validating each hop (SSRF-safe).
      const response = await request(parsed.toString(), {
        method: 'GET',
        dispatcher: agent,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
        headers: {
          host: hostnameForHeader,
          accept: 'image/jpeg,image/png,image/webp,*/*;q=0.8',
        },
      });

      const status = response.statusCode;
      if (status >= 300 && status < 400) {
        if (redirectCount >= maxRedirects) {
          this.deny('redirect_limit', 'Too many redirects');
        }
        const location = response.headers.location;
        const locationHeader = Array.isArray(location) ? location[0] : location;
        // Drain/discard body before following redirect
        response.body.resume();
        const next = resolveRedirectUrl(parsed, locationHeader ?? null);
        try {
          assertPublicHostnameOrIp(next.hostname);
        } catch (error) {
          if (error instanceof SafeRemoteFetchError) {
            this.deny(error.reason, error.message);
          }
          throw error;
        }
        return this.fetchHop(next.toString(), redirectCount + 1);
      }

      if (status < 200 || status >= 300) {
        response.body.resume();
        this.deny('http_status', `Failed to fetch source URL (${status})`);
      }

      const contentLengthHeader = response.headers['content-length'];
      const contentLengthRaw = Array.isArray(contentLengthHeader)
        ? contentLengthHeader[0]
        : contentLengthHeader;
      if (contentLengthRaw) {
        const contentLength = Number(contentLengthRaw);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          response.body.resume();
          this.deny('oversize', 'File is too large');
        }
      }

      const buffer = await readBodyWithLimit(response.body, maxBytes).catch(
        (error: unknown) => {
          if (error instanceof SafeRemoteFetchError) {
            this.deny(error.reason, error.message);
          }
          throw error;
        },
      );
      const contentTypeHeader = response.headers['content-type'];
      const contentTypeRaw = Array.isArray(contentTypeHeader)
        ? contentTypeHeader[0]
        : contentTypeHeader;
      const contentType = contentTypeRaw?.split(';')[0]?.trim() ?? '';

      return { buffer, contentType };
    } catch (error) {
      if (error instanceof SafeRemoteFetchError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.deny('fetch_error', `Failed to fetch source URL: ${message}`);
    } finally {
      await agent.close();
    }
  }
}
