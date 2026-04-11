import { Module } from '@nestjs/common';
import { BulkPricingService } from './bulk-pricing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [BulkPricingService],
  exports: [BulkPricingService],
})
export class BulkPricingModule {}
