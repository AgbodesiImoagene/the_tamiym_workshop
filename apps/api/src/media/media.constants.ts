export const MEDIA_QUEUE = 'media';

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_DISPLAY_MAX = 2048;
export const MEDIA_THUMB_MAX = 400;
/** Bound decoded pixel count for sharp identify + derivatives. */
export const MEDIA_SHARP_LIMIT_INPUT_PIXELS = 50_000_000;

export const MEDIA_SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
