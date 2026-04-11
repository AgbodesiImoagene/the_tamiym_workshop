import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { DesignAssetsController } from './design-assets.controller';
import { DesignAssetsService } from './design-assets.service';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [DesignAssetsController],
  providers: [DesignAssetsService],
  exports: [DesignAssetsService],
})
export class DesignAssetsModule {}
