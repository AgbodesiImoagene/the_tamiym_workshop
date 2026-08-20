import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ObservabilityService } from '../observability/observability.service';
import { S3Service } from '../storage/s3.service';
import { MEDIA_QUEUE } from './media.constants';
import {
  createSafeRemoteMediaFetcher,
  createVirusScanner,
} from './media-providers';
import { MediaProcessor } from './media.processor';
import { MediaService } from './media.service';
import { SafeRemoteMediaFetcher } from './safe-remote-fetch';
import { VirusScanService } from './virus-scan.service';
import { VIRUS_SCANNER } from './virus-scanner.types';

@Module({
  imports: [
    PrismaModule,
    ModerationModule,
    BullModule.registerQueue({ name: MEDIA_QUEUE }),
  ],
  providers: [
    MediaService,
    MediaProcessor,
    VirusScanService,
    S3Service,
    {
      provide: VIRUS_SCANNER,
      useFactory: createVirusScanner,
    },
    {
      provide: SafeRemoteMediaFetcher,
      useFactory: createSafeRemoteMediaFetcher,
      inject: [ObservabilityService],
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
