import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities';
import { AccountDataModule } from '../account/account-data.module';
import { AuthWebModule } from '../auth/auth-web.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthWebModule, AccountDataModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
