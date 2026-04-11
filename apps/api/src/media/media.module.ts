import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { S3Service } from '../storage/s3.service';
import { MEDIA_QUEUE } from './media.constants';
import { MediaProcessor } from './media.processor';
import { MediaService } from './media.service';
import { VirusScanService } from './virus-scan.service';

@Module({
  imports: [
    PrismaModule,
    ModerationModule,
    BullModule.registerQueue({ name: MEDIA_QUEUE }),
  ],
  providers: [MediaService, MediaProcessor, VirusScanService, S3Service],
  exports: [MediaService],
})
export class MediaModule {}
