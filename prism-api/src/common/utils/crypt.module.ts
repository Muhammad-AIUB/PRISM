import { Global, Module } from '@nestjs/common';
import { CryptService } from './crypt.service';

/** Global: any module reading users.github_token needs this. */
@Global()
@Module({
  providers: [CryptService],
  exports: [CryptService],
})
export class CryptModule {}
