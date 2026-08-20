import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationService } from './moderation.service';
import { ModerationDecisionService } from './moderation-decision.service';
import { ModerationAppealsController } from './moderation-appeals.controller';

/**
 * Cross-cutting moderation module. Import wherever AI content screening or
 * immutable decision/appeal workflow is needed.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ModerationAppealsController],
  providers: [ModerationService, ModerationDecisionService],
  exports: [ModerationService, ModerationDecisionService],
})
export class ModerationModule {}
