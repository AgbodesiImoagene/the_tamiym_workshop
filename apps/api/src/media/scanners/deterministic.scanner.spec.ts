import { VirusScanStatus } from '../../generated/prisma/enums';
import {
  DeterministicScanner,
  EICAR_TEST_MARKER,
} from './deterministic.scanner';

describe('DeterministicScanner', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns CLEAN for ordinary buffers', async () => {
    delete process.env.VIRUS_SCANNER;
    delete process.env.VIRUS_SCAN_FIXTURE;
    const scanner = new DeterministicScanner();
    await expect(scanner.scan(Buffer.from('hello'))).resolves.toEqual({
      status: VirusScanStatus.CLEAN,
    });
  });

  it('returns INFECTED when buffer contains EICAR-TEST', async () => {
    delete process.env.VIRUS_SCAN_FIXTURE;
    const scanner = new DeterministicScanner();
    const buffer = Buffer.from(`xx${EICAR_TEST_MARKER}yy`, 'ascii');
    await expect(scanner.scan(buffer)).resolves.toEqual({
      status: VirusScanStatus.INFECTED,
      signature: EICAR_TEST_MARKER,
    });
  });

  it('throws when VIRUS_SCANNER=unavailable', async () => {
    process.env.VIRUS_SCANNER = 'unavailable';
    const scanner = new DeterministicScanner();
    await expect(scanner.scan(Buffer.from('clean'))).rejects.toThrow(
      /unavailable/i,
    );
  });
});
