import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectCannedACL } from '@aws-sdk/client-s3';

type UploadResult = {
  key: string;
  url: string;
};

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
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

  private buildDefaultUrl(key: string): string {
    const endpoint = this.config.get<string>('S3_ENDPOINT') ?? '';
    if (!endpoint) {
      return `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    return `${endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
  }
}
