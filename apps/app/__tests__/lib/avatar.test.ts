/**
 * TTW-263: the browser shrinks a large photo before sending it, and refuses a file the API
 * would refuse. The API does not rely on it and compresses again.
 */
import { AVATAR_MAX_BYTES, AVATAR_PICK_MESSAGE, avatarSrc, prepareAvatarFile } from '@/lib/avatar';

function file(type: string, size: number, name = 'me'): File {
  return new File([new Uint8Array(size)], name, { type });
}

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
});

describe('avatarSrc', () => {
  it('points at the authenticated picture route and carries the version', () => {
    expect(avatarSrc('abc123')).toMatch(/\/users\/profile\/avatar\?v=abc123$/);
  });

  it('is undefined when the user has no picture', () => {
    expect(avatarSrc(undefined)).toBeUndefined();
  });
});

describe('prepareAvatarFile', () => {
  it.each(['image/gif', 'application/pdf', 'text/plain', ''])(
    'refuses %p before anything is sent',
    async (type) => {
      await expect(prepareAvatarFile(file(type, 1000))).rejects.toThrow(AVATAR_PICK_MESSAGE);
    }
  );

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'lets a small %s through as is',
    async (type) => {
      const original = file(type, 2000);
      await expect(prepareAvatarFile(original)).resolves.toBe(original);
    }
  );

  it('refuses a file over the API limit that cannot be shrunk here', async () => {
    await expect(prepareAvatarFile(file('image/jpeg', AVATAR_MAX_BYTES + 1))).rejects.toThrow(
      /smaller than 5 MB/
    );
  });

  it('shrinks a large photo to at most 1024 px and sends it as WebP', async () => {
    const close = jest.fn();
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = jest
      .fn()
      .mockResolvedValue({ width: 4000, height: 3000, close });
    const drawImage = jest.fn();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    let canvasSize = '';
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback,
      type
    ) {
      canvasSize = `${this.width}x${this.height}`;
      callback(new Blob([new Uint8Array(900)], { type: type as string }));
    });

    const original = file('image/jpeg', 4 * 1024 * 1024, 'holiday.jpg');
    const result = await prepareAvatarFile(original);

    expect(canvasSize).toBe('1024x768');
    expect(result.type).toBe('image/webp');
    expect(result.size).toBe(900);
    expect(close).toHaveBeenCalled();
  });

  it('falls back to the original when shrinking fails and the file is small enough', async () => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = jest
      .fn()
      .mockRejectedValue(new Error('cannot decode'));
    const original = file('image/png', 3000);
    await expect(prepareAvatarFile(original)).resolves.toBe(original);
  });
});
