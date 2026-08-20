import { ClamAvTcpScanner } from './scanners/clamav-tcp.scanner';
import { DeterministicScanner } from './scanners/deterministic.scanner';
import type { ObservabilityService } from '../observability/observability.service';
import { SafeRemoteMediaFetcher } from './safe-remote-fetch';

/**
 * Select virus scanner implementation from env.
 * Production always uses ClamAV; deterministic/unavailable modes are forbidden.
 */
export function createVirusScanner(): ClamAvTcpScanner | DeterministicScanner {
  const mode = (process.env.VIRUS_SCANNER ?? '').trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && (mode === 'deterministic' || mode === 'unavailable')) {
    throw new Error(
      `VIRUS_SCANNER=${mode} is forbidden in production; use clamav`,
    );
  }

  if (mode === 'clamav' || isProduction) {
    if (isProduction && !process.env.CLAMAV_HOST?.trim()) {
      throw new Error(
        'CLAMAV_HOST is required when using ClamAV in production',
      );
    }
    return new ClamAvTcpScanner();
  }

  // test / development default (including VIRUS_SCANNER=deterministic|unavailable)
  return new DeterministicScanner();
}

export function createSafeRemoteMediaFetcher(
  observability: ObservabilityService,
): SafeRemoteMediaFetcher {
  return new SafeRemoteMediaFetcher({
    onDenied: (reason) => observability.recordMediaFetchDenied({ reason }),
  });
}
