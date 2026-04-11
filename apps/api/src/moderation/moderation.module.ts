import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ModerationService } from './moderation.service';

/**
 * Cross-cutting moderation module. Import wherever AI content screening is needed
 * (MediaModule, DesignsModule, FundraisingModule, etc.).
 */
@Module({
  imports: [ConfigModule],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
