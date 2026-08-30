import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * Mirrors SettingsController's validate() rules.
 *
 * The Slack prefix check is not decoration: without it this endpoint would
 * POST arbitrary JSON to any URL the user supplies, on the server's behalf.
 */
const SLACK_WEBHOOK_PREFIX = /^https:\/\/hooks\.slack\.com\//;

export class CreateApiTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  email_notifications?: boolean;

  /**
   * Explicitly nullable — sending null is how the UI clears a configured
   * webhook, so it must not be conflated with the key being absent.
   */
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Matches(SLACK_WEBHOOK_PREFIX, {
    message: 'slack_webhook_url must start with https://hooks.slack.com/',
  })
  slack_webhook_url?: string | null;
}

export class TestSlackDto {
  @IsUrl({ require_protocol: true })
  @Matches(SLACK_WEBHOOK_PREFIX, {
    message: 'slack_webhook_url must start with https://hooks.slack.com/',
  })
  slack_webhook_url!: string;
}
