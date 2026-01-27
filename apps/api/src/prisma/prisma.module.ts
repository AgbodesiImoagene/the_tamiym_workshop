import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule provides a global PrismaService instance.
 *
 * Making it global allows any module in the application to inject
 * PrismaService without explicitly importing PrismaModule.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
