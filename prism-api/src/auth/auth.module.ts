import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalAccessToken, User } from '../database/entities';
import { SanctumAuthGuard } from './sanctum-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([PersonalAccessToken, User])],
  providers: [SanctumAuthGuard],
  exports: [SanctumAuthGuard, TypeOrmModule],
})
export class AuthModule {}
