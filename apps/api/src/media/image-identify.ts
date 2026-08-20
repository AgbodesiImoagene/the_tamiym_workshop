import sharp from 'sharp';
import { MEDIA_SHARP_LIMIT_INPUT_PIXELS } from './media.constants';

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type IdentifiedImage = {
  mimeType: string;
  width: number | null;
  height: number | null;
  format: string;
};

/**
 * Re-identify image bytes with bounded sharp decoding.
 * MIME is derived from decoder metadata only — never from client claims.
 * Call only after malware scan returns CLEAN.
 */
export async function identifyImageBuffer(
  buffer: Buffer,
): Promise<IdentifiedImage> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MEDIA_SHARP_LIMIT_INPUT_PIXELS,
    }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unsupported or corrupt image: ${message}`);
  }

  const format = metadata.format;
  if (!format || !(format in FORMAT_TO_MIME)) {
    throw new Error(
      `Unsupported or corrupt image: format=${format ?? 'unknown'}`,
    );
  }

  return {
    mimeType: FORMAT_TO_MIME[format],
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format,
  };
}
