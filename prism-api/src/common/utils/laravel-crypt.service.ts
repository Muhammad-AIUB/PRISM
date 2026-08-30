import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface LaravelEncryptionPayload {
  iv: string;
  value: string;
  mac: string;
  tag?: string;
}

/**
 * Reads columns written by Laravel's `encrypted` cast (users.github_token).
 *
 * Laravel's default cipher is AES-256-CBC. The stored value is base64(JSON)
 * with { iv, value, mac }, where mac = HMAC-SHA256(iv . value) using APP_KEY.
 * Verify the MAC before decrypting — an unauthenticated CBC decrypt is a
 * padding-oracle waiting to happen.
 */
@Injectable()
export class LaravelCryptService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const appKey = configService.get<string>('app.key') ?? '';
    const raw = appKey.startsWith('base64:') ? appKey.slice('base64:'.length) : appKey;
    this.key = Buffer.from(raw, 'base64');

    if (this.key.length !== 32) {
      throw new Error(
        `APP_KEY must decode to 32 bytes for AES-256-CBC, got ${this.key.length}.`,
      );
    }
  }

  /**
   * Writes a value Laravel's `encrypted` cast can read back.
   *
   * Required as soon as NestJS owns GitHub OAuth: it stores
   * users.github_token, and the Laravel app (and its queue worker) still read
   * that column through the cast. A plaintext write there would surface as
   * "The MAC is invalid." on the PHP side.
   *
   * Laravel's Encrypter emits base64(json({iv, value, mac, tag})) where the
   * inner value is PHP-serialised BEFORE encryption and `tag` is empty for the
   * non-AEAD default cipher.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.key, iv);

    const value = Buffer.concat([
      cipher.update(Buffer.from(this.serializeString(plaintext), 'utf8')),
      cipher.final(),
    ]).toString('base64');

    const encodedIv = iv.toString('base64');
    const mac = createHmac('sha256', this.key).update(encodedIv + value).digest('hex');

    return Buffer.from(
      JSON.stringify({ iv: encodedIv, value, mac, tag: '' }),
      'utf8',
    ).toString('base64');
  }

  decrypt(payload: string | null): string | null {
    if (!payload) {
      return null;
    }

    let parsed: LaravelEncryptionPayload;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as LaravelEncryptionPayload;
    } catch {
      throw new InternalServerErrorException('Could not decode encrypted payload.');
    }

    if (!this.macIsValid(parsed)) {
      throw new InternalServerErrorException('The MAC is invalid.');
    }

    const decipher = createDecipheriv('aes-256-cbc', this.key, Buffer.from(parsed.iv, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parsed.value, 'base64')),
      decipher.final(),
    ]);

    // Laravel serialises before encrypting; `encrypted` cast values are PHP
    // strings, which serialize() wraps as: s:<len>:"<value>";
    return this.unserializeString(plaintext.toString('utf8'));
  }

  private macIsValid(payload: LaravelEncryptionPayload): boolean {
    const expected = createHmac('sha256', this.key)
      .update(payload.iv + payload.value)
      .digest();
    const actual = Buffer.from(payload.mac, 'hex');

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  /**
   * PHP's serialize() for a string: s:<byte length>:"<value>";
   * The length is in BYTES, not characters — a multi-byte token would produce
   * an unreadable payload if this counted characters.
   */
  private serializeString(value: string): string {
    return `s:${Buffer.byteLength(value, 'utf8')}:"${value}";`;
  }

  private unserializeString(value: string): string {
    const match = /^s:\d+:"([\s\S]*)";$/.exec(value);

    return match?.[1] ?? value;
  }
}
