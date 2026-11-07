import { Module } from '@nestjs/common';
import { ReviewCheckpointStore } from './review-checkpoint.store';

/** Its own module so account erasure can import the store without importing the whole review pipeline. Redis is global. */
@Module({
  providers: [ReviewCheckpointStore],
  exports: [ReviewCheckpointStore],
})
export class ReviewCheckpointModule {}
