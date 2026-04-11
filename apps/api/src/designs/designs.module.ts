import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { S3Service } from '../storage/s3.service';
import { DesignsController } from './designs.controller';
import { PublicDesignsController } from './public-designs.controller';
import { DesignsService } from './designs.service';

@Module({
  imports: [PrismaModule, ModerationModule, AdminNotificationsModule],
  controllers: [DesignsController, PublicDesignsController],
  providers: [DesignsService, S3Service],
  exports: [DesignsService],
})
export class DesignsModule {}
