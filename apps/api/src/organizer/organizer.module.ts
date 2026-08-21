import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { OrganizerApplicationsService } from './organizer-applications.service';
import { OrganizerApplicationsController } from './organizer-applications.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, MailModule],
  controllers: [OrganizerApplicationsController],
  providers: [OrganizerApplicationsService],
  exports: [OrganizerApplicationsService],
})
export class OrganizerModule {}
