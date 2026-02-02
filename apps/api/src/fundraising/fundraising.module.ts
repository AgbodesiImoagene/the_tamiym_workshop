import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { PublicFundraisersController } from './public-fundraisers.controller';
import { CampaignsService } from './campaigns.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CampaignsController, PublicFundraisersController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class FundraisingModule {}
