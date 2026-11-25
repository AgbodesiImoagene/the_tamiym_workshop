import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { identifyImageBuffer } from '../media/image-identify';
import { MEDIA_SHARP_LIMIT_INPUT_PIXELS } from '../media/media.constants';

/** Largest file the API reads for a profile picture (TTW-263). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** The stored picture is a square of at most this many pixels. */
export const AVATAR_SIZE = 256;
const AVATAR_WEBP_QUALITY = 80;

/**
 * Turn an uploaded image into the stored profile picture: a centred square, at most
 * {@link AVATAR_SIZE} px, WebP, with no metadata (EXIF, GPS, colour profile text).
 *
 * The format comes from the decoder, never from the client's MIME type or file name, and
 * only JPEG, PNG and WebP are accepted. Call it on bytes that have already been scanned.
 * Any decode problem is the caller's fault: a 400, with no detail about the decoder.
 */
export async function processAvatarImage(buffer: Buffer): Promise<Buffer> {
  try {
    const { width, height } = await identifyImageBuffer(buffer);
    if (!width || !height) throw new Error('No dimensions');
    // The picture is square, and never larger than its shortest side (no enlarging).
    const side = Math.min(AVATAR_SIZE, width, height);
    return await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MEDIA_SHARP_LIMIT_INPUT_PIXELS,
    })
      .rotate() // apply the EXIF orientation before the metadata is dropped
      .resize({ width: side, height: side, fit: 'cover', position: 'centre' })
      .webp({ quality: AVATAR_WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new BadRequestException(
      'The file is not a valid JPEG, PNG or WebP image',
    );
  }
}

/** The random part of an avatar key, or null. Exposed as `avatarVersion`, never the key. */
export function avatarVersionOf(key: string | null | undefined): string | null {
  if (!key) return null;
  const match = /\/([0-9a-f]+)\.webp$/.exec(key);
  return match ? match[1] : null;
}
