import { Readable } from 'node:stream';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectCannedACL } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type UploadResult = {
  key: string;
  url: string;
};

/** Default and maximum lifetime of a signed read link (TTW-099). */
export const SIGNED_READ_URL_TTL_SECONDS = 300;
export const SIGNED_READ_URL_MAX_TTL_SECONDS = 900;

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  /**
   * Bucket for customer uploads (TTW-099). Never served through S3_PUBLIC_URL,
   * never written with an ACL, read only through short-lived signed links.
   */
  private readonly privateBucket: string;
  private readonly publicUrl?: string;
  /**
   * When true, PutObject requests include ACL: 'public-read'.
   * Set S3_PUBLIC_ACL=true only if the bucket allows public ACLs
   * (i.e. BlockPublicAcls=false). Most modern AWS buckets block this
   * by default — use a bucket policy for public access instead.
   */
  private readonly publicAcl: boolean;

  constructor(private config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    this.bucket = this.config.get<string>('S3_BUCKET') ?? '';
    this.privateBucket = this.config.get<string>('S3_PRIVATE_BUCKET') ?? '';
    if (this.privateBucket && this.privateBucket === this.bucket) {
      throw new InternalServerErrorException(
        'S3_PRIVATE_BUCKET must be a different bucket from S3_BUCKET: ' +
          'customer uploads must never share the public bucket.',
      );
    }
    this.publicUrl = this.config.get<string>('S3_PUBLIC_URL') || undefined;
    this.publicAcl = this.config.get<string>('S3_PUBLIC_ACL') === 'true';

    const accessKey = this.config.get<string>('S3_ACCESS_KEY') ?? '';
    const secretKey = this.config.get<string>('S3_SECRET_KEY') ?? '';

    if (this.bucket && (!accessKey || !secretKey)) {
      throw new InternalServerErrorException(
        'S3_BUCKET is configured but S3_ACCESS_KEY / S3_SECRET_KEY are missing. ' +
          'Set the credentials or leave S3_BUCKET unset to disable storage.',
      );
    }

    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }

  async uploadObject(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<UploadResult> {
    if (!this.bucket) {
      throw new InternalServerErrorException('S3 bucket not configured');
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.key,
          Body: params.buffer,
          ContentType: params.contentType,
          ...(this.publicAcl ? { ACL: 'public-read' as ObjectCannedACL } : {}),
        }),
      );
    } catch {
      throw new InternalServerErrorException('Failed to upload image');
    }
    const url = this.publicUrl
      ? `${this.publicUrl}/${params.key}`
      : this.buildDefaultUrl(params.key);
    return { key: params.key, url };
  }

  /** Keys under a prefix of the PUBLIC bucket (TTW-237 clean-up of legacy thumbnails). */
  async listObjectKeys(prefix: string): Promise<string[]> {
    if (!this.bucket) {
      throw new InternalServerErrorException('S3 bucket not configured');
    }
    const keys: string[] = [];
    let token: string | undefined;
    try {
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key) keys.push(object.Key);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    } catch {
      throw new InternalServerErrorException('Failed to list objects');
    }
    return keys;
  }

  /** Delete one object of the PUBLIC bucket. */
  async deleteObject(key: string): Promise<void> {
    if (!this.bucket) {
      throw new InternalServerErrorException('S3 bucket not configured');
    }
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      throw new InternalServerErrorException('Failed to delete image');
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    if (!this.bucket) {
      throw new InternalServerErrorException('S3 bucket not configured');
    }
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      const body = response.Body;
      if (!body || typeof body === 'string') {
        throw new InternalServerErrorException('Failed to read object body');
      }
      return Buffer.from(await body.transformToByteArray());
    } catch {
      throw new InternalServerErrorException('Failed to download image');
    }
  }

  /**
   * Write a customer upload to the private bucket. No ACL, no public URL: only the
   * key is returned. Fails closed when the private bucket is not configured; it never
   * falls back to the public bucket.
   */
  async uploadPrivateObject(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<{ key: string }> {
    const bucket = this.requirePrivateBucket();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: params.key,
          Body: params.buffer,
          ContentType: params.contentType,
        }),
      );
    } catch {
      throw new InternalServerErrorException('Failed to upload image');
    }
    return { key: params.key };
  }

  async getPrivateObjectBuffer(key: string): Promise<Buffer> {
    const bucket = this.requirePrivateBucket();
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const body = response.Body;
      if (!body || typeof body === 'string') {
        throw new InternalServerErrorException('Failed to read object body');
      }
      return Buffer.from(await body.transformToByteArray());
    } catch {
      throw new InternalServerErrorException('Failed to download image');
    }
  }

  /** Delete a private object (an infected upload). */
  async deletePrivateObject(key: string): Promise<void> {
    const bucket = this.requirePrivateBucket();
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch {
      throw new InternalServerErrorException('Failed to delete image');
    }
  }

  /** Stream a private object without loading it in memory. */
  async getPrivateObjectStream(
    key: string,
  ): Promise<{ stream: Readable; contentLength?: number }> {
    const bucket = this.requirePrivateBucket();
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const body = response.Body;
      if (!(body instanceof Readable)) {
        throw new InternalServerErrorException('Failed to read object body');
      }
      return { stream: body, contentLength: response.ContentLength };
    } catch {
      throw new InternalServerErrorException('Failed to download image');
    }
  }

  /**
   * Signed GET link for a private object. Computed locally (no storage call), never
   * persisted and never logged by callers. The lifetime is capped.
   */
  async createPrivateReadUrl(
    key: string,
    ttlSeconds: number = SIGNED_READ_URL_TTL_SECONDS,
  ): Promise<string> {
    const bucket = this.requirePrivateBucket();
    const expiresIn = Math.max(
      1,
      Math.min(Math.floor(ttlSeconds), SIGNED_READ_URL_MAX_TTL_SECONDS),
    );
    try {
      return await getSignedUrl(
        // The presigner resolves a newer @smithy/types than client-s3 in the lockfile, so
        // the two S3Client types differ nominally. Same runtime class.
        this.client as unknown as Parameters<typeof getSignedUrl>[0],
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }) as unknown as Parameters<typeof getSignedUrl>[1],
        { expiresIn },
      );
    } catch {
      throw new InternalServerErrorException('Failed to sign image link');
    }
  }

  private requirePrivateBucket(): string {
    if (!this.privateBucket) {
      throw new InternalServerErrorException(
        'Private S3 bucket not configured',
      );
    }
    return this.privateBucket;
  }

  private buildDefaultUrl(key: string): string {
    const endpoint = this.config.get<string>('S3_ENDPOINT') ?? '';
    if (!endpoint) {
      return `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    return `${endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
  }
}
