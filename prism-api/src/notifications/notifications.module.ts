import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { SlackService } from './slack.service';

@Module({
  providers: [EmailService, SlackService],
  exports: [EmailService, SlackService],
})
export class NotificationsModule {}
