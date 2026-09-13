import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalAccessToken, User } from '../database/entities';
import { ApiTokenAuthGuard } from './api-token-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([PersonalAccessToken, User])],
  providers: [ApiTokenAuthGuard],
  exports: [ApiTokenAuthGuard, TypeOrmModule],
})
export class AuthModule {}
