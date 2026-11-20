import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3Service } from './s3.service';

function makeService(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_PUBLIC_URL: 'http://localhost:9000/public-bucket',
    S3_BUCKET: 'public-bucket',
    S3_PRIVATE_BUCKET: 'private-bucket',
    S3_ACCESS_KEY: 'test-access-key',
    S3_SECRET_KEY: 'test-secret-key',
    S3_REGION: 'us-east-1',
    S3_PUBLIC_ACL: 'true',
    ...overrides,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new S3Service(config);
}

describe('S3Service private objects (TTW-099)', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(() => Promise.resolve({}) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes a private object to the private bucket, without ACL and without a public URL', async () => {
    const service = makeService();

    const result = await service.uploadPrivateObject({
      key: 'media/a1/original.png',
      buffer: Buffer.from('x'),
      contentType: 'image/png',
    });

    expect(result).toEqual({ key: 'media/a1/original.png' });
    const command = sendSpy.mock.calls[0][0] as PutObjectCommand;
    expect(command.input.Bucket).toBe('private-bucket');
    // S3_PUBLIC_ACL=true must never apply to a customer upload.
    expect(command.input.ACL).toBeUndefined();
  });

  it('fails closed when no private bucket is configured, and never falls back to the public one', async () => {
    const service = makeService({ S3_PRIVATE_BUCKET: undefined });

    await expect(
      service.uploadPrivateObject({
        key: 'media/a1/original.png',
        buffer: Buffer.from('x'),
        contentType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('refuses a private bucket that is the same as the public one', () => {
    expect(() => makeService({ S3_PRIVATE_BUCKET: 'public-bucket' })).toThrow(
      /S3_PRIVATE_BUCKET/,
    );
  });

  it('signs a read link for the private bucket that expires in 5 minutes', async () => {
    const service = makeService();

    const url = new URL(
      await service.createPrivateReadUrl('media/a1/original.png'),
    );

    expect(url.pathname).toBe('/private-bucket/media/a1/original.png');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.toString()).not.toContain('public-bucket');
    // Signing is local: no request is sent to the storage.
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('caps the lifetime of a signed link', async () => {
    const service = makeService();

    const url = new URL(
      await service.createPrivateReadUrl('media/a1/original.png', 86_400),
    );

    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(
      900,
    );
  });

  it('cannot sign a link when no private bucket is configured', async () => {
    const service = makeService({ S3_PRIVATE_BUCKET: undefined });

    await expect(
      service.createPrivateReadUrl('media/a1/original.png'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('streams a private object from the private bucket', async () => {
    const service = makeService();
    sendSpy.mockImplementation(() =>
      Promise.resolve({
        Body: Readable.from([Buffer.from('abc')]),
        ContentLength: 3,
      }),
    );

    const result = await service.getPrivateObjectStream('media/a1/thumb.webp');

    const command = sendSpy.mock.calls[0][0] as GetObjectCommand;
    expect(command.input.Bucket).toBe('private-bucket');
    expect(result.contentLength).toBe(3);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('abc');
  });

  it('fails closed when the private object cannot be streamed', async () => {
    const service = makeService();
    sendSpy.mockImplementation(() => Promise.reject(new Error('boom')));

    await expect(
      service.getPrivateObjectStream('media/a1/thumb.webp'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('keeps public uploads on the public bucket with the public URL', async () => {
    const service = makeService();

    const result = await service.uploadObject({
      key: 'media/catalogue/x.webp',
      buffer: Buffer.from('x'),
      contentType: 'image/webp',
    });

    expect(result.url).toBe(
      'http://localhost:9000/public-bucket/media/catalogue/x.webp',
    );
    const command = sendSpy.mock.calls[0][0] as PutObjectCommand;
    expect(command.input.Bucket).toBe('public-bucket');
  });
});
