import * as net from 'node:net';
import { VirusScanStatus } from '../../generated/prisma/enums';
import type { VirusScanResult, VirusScanner } from '../virus-scanner.types';

const DEFAULT_PORT = 3310;
const CHUNK_SIZE = 64 * 1024;

export type TcpConnectFn = (
  options: net.NetConnectOpts,
  connectionListener?: () => void,
) => net.Socket;

function writeAll(socket: net.Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };
    socket.once('error', onError);
    const canContinue = socket.write(data, (error) => {
      if (error) {
        socket.off('error', onError);
        reject(error);
      }
    });
    if (canContinue) {
      socket.off('error', onError);
      resolve();
      return;
    }
    socket.once('drain', () => {
      socket.off('error', onError);
      resolve();
    });
  });
}

/**
 * ClamAV daemon scanner over TCP INSTREAM (`zINSTREAM`).
 * Requires `CLAMAV_HOST` (and optional `CLAMAV_PORT`, default 3310).
 */
export class ClamAvTcpScanner implements VirusScanner {
  constructor(
    private readonly createConnection: TcpConnectFn = net.createConnection,
  ) {}

  async scan(buffer: Buffer): Promise<VirusScanResult> {
    const host = process.env.CLAMAV_HOST?.trim();
    if (!host) {
      throw new Error('CLAMAV_HOST is not configured');
    }
    const port = Number(process.env.CLAMAV_PORT ?? DEFAULT_PORT);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Invalid CLAMAV_PORT: ${process.env.CLAMAV_PORT}`);
    }

    const timeoutMs = Number(process.env.VIRUS_SCAN_TIMEOUT_MS ?? 15_000);

    return new Promise<VirusScanResult>((resolve, reject) => {
      const socket = this.createConnection({ host, port });
      let settled = false;
      let response = '';

      const finish = (err?: Error, result?: VirusScanResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (err) {
          reject(err);
          return;
        }
        resolve(result!);
      };

      const timer = setTimeout(() => {
        finish(new Error('ClamAV scan timed out'));
      }, timeoutMs);

      socket.on('connect', () => {
        void (async () => {
          try {
            await writeAll(socket, Buffer.from('zINSTREAM\0', 'binary'));
            for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
              const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
              const size = Buffer.alloc(4);
              size.writeUInt32BE(chunk.length, 0);
              await writeAll(socket, size);
              await writeAll(socket, chunk);
            }
            const end = Buffer.alloc(4);
            end.writeUInt32BE(0, 0);
            await writeAll(socket, end);
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      });

      socket.on('data', (data: Buffer) => {
        response += data.toString('utf8');
      });

      socket.on('end', () => {
        const trimmed = response.replace(/\0/g, '').trim();
        if (/FOUND/i.test(trimmed)) {
          const match = trimmed.match(/:\s*(.+?)\s+FOUND/i);
          finish(undefined, {
            status: VirusScanStatus.INFECTED,
            signature: match?.[1]?.trim(),
          });
          return;
        }
        if (/\bOK\b/i.test(trimmed)) {
          finish(undefined, { status: VirusScanStatus.CLEAN });
          return;
        }
        finish(
          new Error(`Unexpected ClamAV response: ${trimmed || '(empty)'}`),
        );
      });

      socket.on('error', (error: Error) => {
        finish(error);
      });
    });
  }
}
