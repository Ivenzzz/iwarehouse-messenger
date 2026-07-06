import { Module } from '@nestjs/common';
import { AvatarController } from './avatar.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, AvatarController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
