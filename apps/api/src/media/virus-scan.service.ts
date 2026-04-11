import { Injectable, Logger } from '@nestjs/common';
import { VirusScanStatus } from '../generated/prisma/enums';

@Injectable()
export class VirusScanService {
  private readonly logger = new Logger(VirusScanService.name);

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'VirusScanService is a no-op stub. All uploads are returned as CLEAN ' +
          'without real scanning. Integrate ClamAV or another AV engine before ' +
          'accepting untrusted uploads in production.',
      );
    }
  }

  /**
   * No-op virus scan stub — always returns CLEAN.
   * TODO: Replace with a real scanner (e.g. ClamAV) before accepting
   * untrusted user uploads in production.
   */
  async scanBuffer(): Promise<VirusScanStatus> {
    await Promise.resolve();
    return VirusScanStatus.CLEAN;
  }
}
