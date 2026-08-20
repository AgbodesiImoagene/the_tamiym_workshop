import { VirusScanStatus } from '../generated/prisma/enums';

export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');

export type VirusScanResult = {
  status: VirusScanStatus;
  signature?: string;
};

/**
 * Pluggable malware scanner. Implementations must never report CLEAN when
 * scanning fails or the engine is unavailable — callers treat thrown errors
 * as fail-closed FAILED via VirusScanService.
 */
export interface VirusScanner {
  scan(buffer: Buffer): Promise<VirusScanResult>;
}
