import { identifyImageBuffer } from './image-identify';

jest.mock('sharp', () => {
  const sharpMock = jest.fn();
  return { __esModule: true, default: sharpMock };
});

import sharp from 'sharp';

describe('identifyImageBuffer', () => {
  const sharpMock = sharp as unknown as jest.Mock;

  beforeEach(() => {
    sharpMock.mockReset();
  });

  it('maps jpeg/png/webp metadata to MIME types', async () => {
    sharpMock.mockReturnValue({
      metadata: () => Promise.resolve({ format: 'png', width: 10, height: 20 }),
    });

    await expect(identifyImageBuffer(Buffer.from('x'))).resolves.toEqual({
      mimeType: 'image/png',
      width: 10,
      height: 20,
      format: 'png',
    });
    expect(sharpMock).toHaveBeenCalledWith(Buffer.from('x'), {
      failOn: 'error',
      limitInputPixels: 50_000_000,
    });
  });

  it('throws for unsupported formats', async () => {
    sharpMock.mockReturnValue({
      metadata: () => Promise.resolve({ format: 'gif', width: 1, height: 1 }),
    });

    await expect(identifyImageBuffer(Buffer.from('x'))).rejects.toThrow(
      /Unsupported or corrupt image/,
    );
  });

  it('throws when sharp fails to decode', async () => {
    sharpMock.mockReturnValue({
      metadata: () =>
        Promise.reject(
          new Error('Input buffer contains unsupported image format'),
        ),
    });

    await expect(identifyImageBuffer(Buffer.from('x'))).rejects.toThrow(
      /Unsupported or corrupt image/,
    );
  });
});
