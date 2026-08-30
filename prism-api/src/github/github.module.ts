import { Module } from '@nestjs/common';
import { GithubClientService } from './github-client.service';

@Module({
  providers: [GithubClientService],
  exports: [GithubClientService],
})
export class GithubModule {}
