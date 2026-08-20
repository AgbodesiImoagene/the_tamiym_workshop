import { VirusScanStatus } from '../../generated/prisma/enums';
import type { VirusScanResult, VirusScanner } from '../virus-scanner.types';

/** ASCII substring present in the classic EICAR test file. */
export const EICAR_TEST_MARKER = 'EICAR-TEST';

/**
 * Magic marker bytes that force INFECTED in test fixtures
 * (ASCII `TTW-VIRUS!`).
 */
export const DETERMINISTIC_INFECTED_MAGIC = Buffer.from('TTW-VIRUS!', 'ascii');

/**
 * Deterministic scanner for tests and non-production local development.
 * Never used in production (forbidden by validateEnv / media module factory).
 */
export class DeterministicScanner implements VirusScanner {
  scan(buffer: Buffer): Promise<VirusScanResult> {
    if (process.env.VIRUS_SCANNER === 'unavailable') {
      return Promise.reject(new Error('Virus scanner unavailable'));
    }

    const fixture = process.env.VIRUS_SCAN_FIXTURE?.trim().toLowerCase();
    if (fixture === 'infected') {
      return Promise.resolve({
        status: VirusScanStatus.INFECTED,
        signature: 'VIRUS_SCAN_FIXTURE',
      });
    }
    if (fixture === 'unavailable') {
      return Promise.reject(new Error('Virus scanner unavailable'));
    }

    if (
      buffer.includes(DETERMINISTIC_INFECTED_MAGIC) ||
      buffer.includes(Buffer.from(EICAR_TEST_MARKER, 'ascii'))
    ) {
      return Promise.resolve({
        status: VirusScanStatus.INFECTED,
        signature: EICAR_TEST_MARKER,
      });
    }

    return Promise.resolve({ status: VirusScanStatus.CLEAN });
  }
}
