import { VirusScanStatus } from '../generated/prisma/enums';
import { VirusScanService } from './virus-scan.service';
import type { VirusScanner } from './virus-scanner.types';
import type { ObservabilityService } from '../observability/observability.service';

describe('VirusScanService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  function buildService(
    scanner: VirusScanner,
    observability?: ObservabilityService,
  ) {
    return new VirusScanService(scanner, observability);
  }

  it('returns CLEAN when scanner reports CLEAN', async () => {
    const scanner: VirusScanner = {
      scan: jest.fn().mockResolvedValue({ status: VirusScanStatus.CLEAN }),
    };
    const observability = {
      recordMediaVirusScan: jest.fn(),
    } as unknown as ObservabilityService;

    const service = buildService(scanner, observability);
    await expect(service.scanBuffer(Buffer.from('ok'))).resolves.toBe(
      VirusScanStatus.CLEAN,
    );
    expect(scanner.scan).toHaveBeenCalledWith(Buffer.from('ok'));
    expect(observability.recordMediaVirusScan).toHaveBeenCalledWith({
      outcome: 'clean',
    });
  });

  it('returns INFECTED when scanner reports INFECTED', async () => {
    const scanner: VirusScanner = {
      scan: jest.fn().mockResolvedValue({
        status: VirusScanStatus.INFECTED,
        signature: 'X',
      }),
    };
    const service = buildService(scanner);
    await expect(service.scanBuffer(Buffer.from('bad'))).resolves.toBe(
      VirusScanStatus.INFECTED,
    );
  });

  it('returns FAILED (fail-closed) when scanner throws', async () => {
    const scanner: VirusScanner = {
      scan: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const observability = {
      recordMediaVirusScan: jest.fn(),
    } as unknown as ObservabilityService;

    const service = buildService(scanner, observability);
    await expect(service.scanBuffer(Buffer.from('x'))).resolves.toBe(
      VirusScanStatus.FAILED,
    );
    expect(observability.recordMediaVirusScan).toHaveBeenCalledWith({
      outcome: 'failed',
    });
  });

  it('records unavailable when scanner throws unavailable', async () => {
    const scanner: VirusScanner = {
      scan: jest.fn().mockRejectedValue(new Error('Virus scanner unavailable')),
    };
    const observability = {
      recordMediaVirusScan: jest.fn(),
    } as unknown as ObservabilityService;

    const service = buildService(scanner, observability);
    await expect(service.scanBuffer(Buffer.from('x'))).resolves.toBe(
      VirusScanStatus.FAILED,
    );
    expect(observability.recordMediaVirusScan).toHaveBeenCalledWith({
      outcome: 'unavailable',
    });
  });

  it('returns FAILED for unknown scanner status', async () => {
    const scanner: VirusScanner = {
      scan: jest.fn().mockResolvedValue({
        status: 'WEIRD' as VirusScanStatus,
      }),
    };
    const observability = {
      recordMediaVirusScan: jest.fn(),
    } as unknown as ObservabilityService;

    const service = buildService(scanner, observability);
    await expect(service.scanBuffer(Buffer.from('x'))).resolves.toBe(
      VirusScanStatus.FAILED,
    );
    expect(observability.recordMediaVirusScan).toHaveBeenCalledWith({
      outcome: 'failed',
    });
  });

  it('returns FAILED when scan times out', async () => {
    jest.useFakeTimers();
    const scanner: VirusScanner = {
      scan: jest.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      ),
    };
    process.env.VIRUS_SCAN_TIMEOUT_MS = '50';
    const service = buildService(scanner);
    const pending = service.scanBuffer(Buffer.from('slow'));
    await jest.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toBe(VirusScanStatus.FAILED);
  });
});
