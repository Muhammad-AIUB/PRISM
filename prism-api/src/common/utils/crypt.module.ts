import { Global, Module } from '@nestjs/common';
import { LaravelCryptService } from './laravel-crypt.service';

/** Global: any module reading users.github_token needs this. */
@Global()
@Module({
  providers: [LaravelCryptService],
  exports: [LaravelCryptService],
})
export class CryptModule {}
