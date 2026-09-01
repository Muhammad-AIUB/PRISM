import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { REVIEW_QUEUE } from '../review/review.queue';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [BullModule.registerQueue({ name: REVIEW_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
