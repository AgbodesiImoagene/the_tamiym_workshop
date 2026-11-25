import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VirusScanStatus } from '../generated/prisma/enums';
import { VirusScanService } from '../media/virus-scan.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { AVATAR_MAX_BYTES, processAvatarImage } from './avatar-image';

export const AVATAR_CONTENT_TYPE = 'image/webp';

/**
 * Profile picture of a user (TTW-263). The picture lives in the PRIVATE bucket under
 * `avatars/<userId>/<random>.webp` and is read back only through an authenticated route
 * for the caller's own account. The storage key never leaves this service: callers get a
 * `version` (the random part) to bust caches with.
 */
@Injectable()
export class UserAvatarService {
  private readonly logger = new Logger(UserAvatarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly virusScan: VirusScanService,
  ) {}

  /** Store a new picture (replacing the current one) and return its version. */
  async setAvatar(
    userId: string,
    file: Buffer,
  ): Promise<{ avatarVersion: string }> {
    if (file.length === 0 || file.length > AVATAR_MAX_BYTES) {
      throw new BadRequestException(
        `The picture must be smaller than ${AVATAR_MAX_BYTES / (1024 * 1024)} MB`,
      );
    }

    // Raw bytes are scanned before any decoding. A scanner outage fails closed.
    const scan = await this.virusScan.scanBuffer(file);
    if (scan === VirusScanStatus.INFECTED) {
      throw new BadRequestException('The file was rejected');
    }
    if (scan !== VirusScanStatus.CLEAN) {
      throw new ServiceUnavailableException(
        'The picture cannot be checked right now. Try again later.',
      );
    }

    const picture = await processAvatarImage(file);

    const version = randomBytes(16).toString('hex');
    const key = `avatars/${userId}/${version}.webp`;
    const previous = await this.currentKey(userId);

    await this.s3.uploadPrivateObject({
      key,
      buffer: picture,
      contentType: AVATAR_CONTENT_TYPE,
    });

    // Conditional on the key read above: a concurrent upload or removal makes this a
    // no-op, and exactly one picture stays referenced. The loser removes its own object.
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, avatarKey: previous },
      data: { avatarKey: key },
    });
    if (count === 0) {
      await this.deleteQuietly(key);
      throw new ConflictException(
        'Your picture changed at the same time. Try again.',
      );
    }

    if (previous) await this.deleteQuietly(previous);
    return { avatarVersion: version };
  }

  /** Remove the picture. Nothing to do when there is none. */
  async removeAvatar(userId: string): Promise<void> {
    const key = await this.currentKey(userId);
    if (!key) return;
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, avatarKey: key },
      data: { avatarKey: null },
    });
    if (count === 1) await this.deleteQuietly(key);
  }

  /** The caller's own picture, as a stream. 404 when there is none. */
  async openAvatar(userId: string): Promise<{
    stream: Readable;
    contentType: string;
    contentLength?: number;
  }> {
    const key = await this.currentKey(userId);
    if (!key) throw new NotFoundException('No profile picture');
    const { stream, contentLength } = await this.s3.getPrivateObjectStream(key);
    return { stream, contentType: AVATAR_CONTENT_TYPE, contentLength };
  }

  /**
   * Delete a picture's object after the account that owned it was erased (the row no longer
   * references it). Never throws: a leftover private object is unreadable and harmless.
   */
  async purgeObject(key: string): Promise<void> {
    await this.deleteQuietly(key);
  }

  private async currentKey(userId: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    return row?.avatarKey ?? null;
  }

  /** A leftover object is harmless (private, unreferenced), so never fail the user for it. */
  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.s3.deletePrivateObject(key);
    } catch {
      this.logger.warn('Could not delete an unreferenced profile picture');
    }
  }
}
