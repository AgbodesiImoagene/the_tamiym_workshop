import { EventEmitter } from 'node:events';
import type * as net from 'node:net';
import { VirusScanStatus } from '../../generated/prisma/enums';
import { ClamAvTcpScanner } from './clamav-tcp.scanner';

class FakeSocket extends EventEmitter {
  destroyed = false;
  written: Buffer[] = [];

  write(
    data: Buffer | string,
    encodingOrCb?: BufferEncoding | ((error?: Error | null) => void),
    cb?: (error?: Error | null) => void,
  ): boolean {
    const chunk = Buffer.isBuffer(data)
      ? data
      : Buffer.from(
          data,
          typeof encodingOrCb === 'string' ? encodingOrCb : 'utf8',
        );
    this.written.push(chunk);
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    callback?.(null);
    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  endReply(text: string): void {
    this.emit('data', Buffer.from(text));
    this.emit('end');
  }
}

describe('ClamAvTcpScanner', () => {
  const originalHost = process.env.CLAMAV_HOST;
  const originalPort = process.env.CLAMAV_PORT;

  beforeEach(() => {
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '3310';
  });

  afterEach(() => {
    if (originalHost === undefined) {
      delete process.env.CLAMAV_HOST;
    } else {
      process.env.CLAMAV_HOST = originalHost;
    }
    if (originalPort === undefined) {
      delete process.env.CLAMAV_PORT;
    } else {
      process.env.CLAMAV_PORT = originalPort;
    }
  });

  it('throws when CLAMAV_HOST is missing', async () => {
    delete process.env.CLAMAV_HOST;
    const scanner = new ClamAvTcpScanner();
    await expect(scanner.scan(Buffer.from('x'))).rejects.toThrow(
      /CLAMAV_HOST is not configured/,
    );
  });

  it('maps OK response to CLEAN', async () => {
    const fake = new FakeSocket();
    const scanner = new ClamAvTcpScanner(() => {
      queueMicrotask(() => fake.emit('connect'));
      return fake as unknown as net.Socket;
    });

    const pending = scanner.scan(Buffer.from('clean-bytes'));
    await Promise.resolve();
    fake.endReply('stream: OK\0');
    await expect(pending).resolves.toEqual({ status: VirusScanStatus.CLEAN });
    expect(fake.written[0]?.toString('binary')).toContain('zINSTREAM');
  });

  it('maps FOUND response to INFECTED with signature', async () => {
    const fake = new FakeSocket();
    const scanner = new ClamAvTcpScanner(() => {
      queueMicrotask(() => fake.emit('connect'));
      return fake as unknown as net.Socket;
    });

    const pending = scanner.scan(Buffer.from('eicar'));
    await Promise.resolve();
    fake.endReply('stream: Eicar-Signature FOUND');
    await expect(pending).resolves.toEqual({
      status: VirusScanStatus.INFECTED,
      signature: 'Eicar-Signature',
    });
  });

  it('rejects unexpected responses', async () => {
    const fake = new FakeSocket();
    const scanner = new ClamAvTcpScanner(() => {
      queueMicrotask(() => fake.emit('connect'));
      return fake as unknown as net.Socket;
    });

    const pending = scanner.scan(Buffer.from('x'));
    await Promise.resolve();
    fake.endReply('stream: UNKNOWN');
    await expect(pending).rejects.toThrow(/Unexpected ClamAV response/);
  });

  it('rejects on socket error', async () => {
    const fake = new FakeSocket();
    const scanner = new ClamAvTcpScanner(() => {
      queueMicrotask(() => fake.emit('error', new Error('ECONNREFUSED')));
      return fake as unknown as net.Socket;
    });

    await expect(scanner.scan(Buffer.from('x'))).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });
});
