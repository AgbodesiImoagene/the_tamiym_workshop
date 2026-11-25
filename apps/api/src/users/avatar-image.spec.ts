import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { AVATAR_SIZE, processAvatarImage } from './avatar-image';

/** A noisy photo-like image: flat colours would compress to almost nothing and prove little. */
async function photo(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp',
  channels: 3 | 4 = 3,
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 31 + (i >> 3)) % 256;
  const image = sharp(raw, { raw: { width, height, channels } });
  return format === 'jpeg'
    ? image.jpeg({ quality: 95 }).toBuffer()
    : format === 'png'
      ? image.png().toBuffer()
      : image.webp({ quality: 95 }).toBuffer();
}

describe('processAvatarImage (TTW-263)', () => {
  it('turns a large landscape JPEG into a small square WebP', async () => {
    const source = await photo(2400, 1600, 'jpeg');
    const output = await processAvatarImage(source);
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(AVATAR_SIZE);
    expect(meta.height).toBe(AVATAR_SIZE);
    expect(output.length).toBeLessThan(source.length / 10);
  });

  it('keeps a small image square and never enlarges it', async () => {
    const output = await processAvatarImage(await photo(100, 60, 'png', 4));
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(100);
    expect(meta.width).toBe(meta.height);
  });

  it('accepts a PNG with transparency and a WebP', async () => {
    for (const format of ['png', 'webp'] as const) {
      const output = await processAvatarImage(await photo(600, 600, format, 4));
      expect((await sharp(output).metadata()).format).toBe('webp');
    }
  });

  it('drops the metadata of the source (EXIF, GPS)', async () => {
    const source = await sharp(await photo(500, 500, 'jpeg'))
      .withExif({ IFD0: { Copyright: 'someone' } })
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const output = await processAvatarImage(source);
    expect((await sharp(output).metadata()).exif).toBeUndefined();
  });

  it('refuses bytes that are not an image, whatever the file is called', async () => {
    await expect(
      processAvatarImage(Buffer.from('<?php echo 1; ?>')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an image format that is not accepted (GIF)', async () => {
    const gif = await sharp(await photo(50, 50, 'png'))
      .gif()
      .toBuffer();
    await expect(processAvatarImage(gif)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a truncated image', async () => {
    const source = await photo(800, 800, 'jpeg');
    await expect(
      processAvatarImage(source.subarray(0, 300)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an image that declares far too many pixels (decompression bomb)', async () => {
    // Tiny on disk (flat grey), 52 megapixels once decoded: above the 50 MP limit.
    const bomb = await sharp({
      create: { width: 7500, height: 7000, channels: 3, background: '#888888' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(processAvatarImage(bomb)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
