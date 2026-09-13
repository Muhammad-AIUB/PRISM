import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EncryptionPayload {
  iv: string;
  value: string;
  mac: string;
  tag?: string;
}

/**
 * Reads and writes the encrypted users.github_token column.
 *
 * The cipher is AES-256-CBC. The stored value is base64(JSON) with
 * { iv, value, mac }, where mac = HMAC-SHA256(iv . value) keyed by APP_KEY.
 * Verify the MAC before decrypting — an unauthenticated CBC decrypt is a
 * padding-oracle waiting to happen.
 *
 * This format is fixed by the rows already in the database, not chosen. It is
 * also why APP_KEY must never be rotated casually: a new key makes every
 * stored token permanently unreadable, and nothing will say so out loud.
 */
@Injectable()
export class CryptService {
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
   * Writes users.github_token in the format the existing rows already use.
   *
   * Every token stored before this service existed is in that format, so read
   * and write have to agree with it exactly — a token written any other way
   * fails MAC verification on the way back out and the user's reviews stop
   * working with no error until someone opens the row.
   *
   * The shape is base64(json({iv, value, mac, tag})), where the inner value is
   * PHP-serialised BEFORE encryption and `tag` is empty for the non-AEAD
   * cipher. The PHP serialisation is part of the stored bytes, not a leftover
   * import: `s:<byte length>:"<value>";` is what sits inside the ciphertext.
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

    let parsed: EncryptionPayload;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as EncryptionPayload;
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

    // The original serialises before encrypting; `encrypted` cast values are PHP
    // strings, which serialize() wraps as: s:<len>:"<value>";
    return this.unserializeString(plaintext.toString('utf8'));
  }

  private macIsValid(payload: EncryptionPayload): boolean {
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
