import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserAvatarService } from './user-avatar.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [UsersController],
  providers: [UsersService, UserAvatarService],
  exports: [UsersService, UserAvatarService],
})
export class UsersModule {}
