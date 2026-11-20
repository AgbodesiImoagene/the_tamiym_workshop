import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { DesignAssetsController } from './design-assets.controller';
import { DesignAssetsService } from './design-assets.service';
import { S3Service } from '../storage/s3.service';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [DesignAssetsController],
  providers: [DesignAssetsService, S3Service],
  exports: [DesignAssetsService],
})
export class DesignAssetsModule {}
