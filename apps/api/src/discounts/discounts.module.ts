import { Module } from '@nestjs/common';
import { DiscountsService } from './discounts.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DiscountsService],
  exports: [DiscountsService],
})
export class DiscountsModule {}
