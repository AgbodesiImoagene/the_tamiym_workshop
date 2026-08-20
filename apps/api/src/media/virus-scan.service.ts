import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { VirusScanStatus } from '../generated/prisma/enums';
import { ObservabilityService } from '../observability/observability.service';
import { VIRUS_SCANNER, type VirusScanner } from './virus-scanner.types';

const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class VirusScanService {
  private readonly logger = new Logger(VirusScanService.name);

  constructor(
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScanner,
    @Optional() private readonly observability?: ObservabilityService,
  ) {}

  /**
   * Scan media bytes. Fail-closed: timeouts and scanner errors return FAILED,
   * never CLEAN.
   */
  async scanBuffer(buffer: Buffer): Promise<VirusScanStatus> {
    const timeoutMs = Number(
      process.env.VIRUS_SCAN_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
    );
    let timer: NodeJS.Timeout | undefined;

    try {
      const result = await Promise.race([
        this.scanner.scan(buffer),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Virus scan timed out')),
            Number.isFinite(timeoutMs) && timeoutMs > 0
              ? timeoutMs
              : DEFAULT_TIMEOUT_MS,
          );
        }),
      ]);

      if (result.status === VirusScanStatus.CLEAN) {
        this.recordOutcome('clean');
        return VirusScanStatus.CLEAN;
      }
      if (result.status === VirusScanStatus.INFECTED) {
        this.logger.warn(
          `Virus scan INFECTED${result.signature ? `: ${result.signature}` : ''}`,
        );
        this.recordOutcome('infected');
        return VirusScanStatus.INFECTED;
      }

      this.recordOutcome('failed');
      return VirusScanStatus.FAILED;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Virus scan failed closed: ${message}`);
      const unavailable = /unavailable/i.test(message);
      this.recordOutcome(unavailable ? 'unavailable' : 'failed');
      return VirusScanStatus.FAILED;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private recordOutcome(
    outcome: 'clean' | 'infected' | 'failed' | 'unavailable',
  ): void {
    this.observability?.recordMediaVirusScan({ outcome });
  }
}
