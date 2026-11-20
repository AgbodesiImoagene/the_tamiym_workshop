import { StreamableFile } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Readable } from 'node:stream';
import { PublicDesignsController } from './public-designs.controller';
import { DesignsService } from './designs.service';
import { DesignAssetsService } from '../design-assets/design-assets.service';

describe('PublicDesignsController', () => {
  let controller: PublicDesignsController;
  const designsService = { findByShareToken: jest.fn() };
  const designAssetsService = { openSharedFile: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicDesignsController],
      providers: [
        { provide: DesignsService, useValue: designsService },
        { provide: DesignAssetsService, useValue: designAssetsService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PublicDesignsController);
  });

  it('delegates public lookup', async () => {
    designsService.findByShareToken.mockResolvedValue({ id: 'd1' });
    await expect(controller.findByShareToken('tok')).resolves.toEqual({
      id: 'd1',
    });
  });

  it('streams a shared image with the type the service announced (TTW-234)', async () => {
    designAssetsService.openSharedFile.mockResolvedValue({
      stream: Readable.from([Buffer.from('png')]),
      contentType: 'image/png',
      contentLength: 3,
    });

    const file = await controller.sharedAssetFile('tok', 'da_1', 'thumb');

    expect(designAssetsService.openSharedFile).toHaveBeenCalledWith(
      'tok',
      'da_1',
      'thumb',
    );
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders()).toMatchObject({
      type: 'image/png',
      length: 3,
    });
  });
});
