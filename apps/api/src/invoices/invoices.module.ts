import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import {
  AdminOrderInvoiceController,
  OrderInvoiceController,
} from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrderInvoiceController, AdminOrderInvoiceController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
