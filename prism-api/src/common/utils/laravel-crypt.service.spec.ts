import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { LaravelCryptService } from './laravel-crypt.service';

/**
 * Cross-runtime parity for users.github_token.
 *
 * The fixtures were produced by Laravel's real Encrypter, so this asserts
 * PHP -> TS against genuine output rather than a reimplementation.
 *
 * This still matters with Laravel gone: every github_token already in the
 * production database was written by it, and these rows have to stay readable.
 * The TS -> PHP direction was verified before the PHP was deleted (7/7 samples,
 * including empty, multibyte and embedded quotes) and no longer has a second
 * runtime to check against.
 *
 * The fixtures are frozen — the generator needed vendor/autoload.php.
 */
interface CryptFixtures {
  app_key: string;
  payloads: Record<string, { value: string; payload: string }>;
}

const fixtures = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'test', 'fixtures', 'laravel-encrypted.json'), 'utf8'),
) as CryptFixtures;

const configFor = (appKey: string) =>
  ({ get: (key: string) => (key === 'app.key' ? appKey : undefined) }) as unknown as ConfigService;

describe('LaravelCryptService', () => {
  const crypt = new LaravelCryptService(configFor(fixtures.app_key));

  describe('decrypt', () => {
    it.each(Object.entries(fixtures.payloads))(
      'reads a Laravel-encrypted %s value',
      (_name, { value, payload }) => {
        expect(crypt.decrypt(payload)).toBe(value);
      },
    );

    it('returns null for a null column', () => {
      expect(crypt.decrypt(null)).toBeNull();
      expect(crypt.decrypt('')).toBeNull();
    });

    it('rejects a tampered payload rather than decrypting it', () => {
      const first = Object.values(fixtures.payloads)[0];

      if (!first) {
        throw new Error('laravel-encrypted.json has no payloads — regenerate the fixtures.');
      }

      const { payload } = first;
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {
        iv: string;
        value: string;
        mac: string;
      };

      // Flip the ciphertext but keep the original MAC.
      const tampered = Buffer.from(
        JSON.stringify({ ...decoded, value: Buffer.from('nope').toString('base64') }),
        'utf8',
      ).toString('base64');

      expect(() => crypt.decrypt(tampered)).toThrow('The MAC is invalid.');
    });

    it('rejects a payload that is not base64 JSON', () => {
      expect(() => crypt.decrypt('!!!not-base64-json!!!')).toThrow();
    });
  });

  describe('encrypt', () => {
    it.each(Object.entries(fixtures.payloads))('round-trips a %s value', (_name, { value }) => {
      expect(crypt.decrypt(crypt.encrypt(value))).toBe(value);
    });

    it('emits the four keys Laravel expects, with an empty non-AEAD tag', () => {
      const decoded = JSON.parse(
        Buffer.from(crypt.encrypt('gho_x'), 'base64').toString('utf8'),
      ) as Record<string, string>;

      expect(Object.keys(decoded).sort()).toEqual(['iv', 'mac', 'tag', 'value']);
      expect(decoded.tag).toBe('');
      expect(Buffer.from(decoded.iv ?? '', 'base64')).toHaveLength(16);
      expect(decoded.mac).toMatch(/^[0-9a-f]{64}$/);
    });

    it('uses a fresh IV each time, so the same token never repeats a ciphertext', () => {
      expect(crypt.encrypt('gho_same')).not.toBe(crypt.encrypt('gho_same'));
    });

    it('counts the PHP serialised length in bytes, not characters', () => {
      // A character-counted length would make PHP's unserialize() fail here.
      const multibyte = 'টোকেন-🔍';

      expect(crypt.decrypt(crypt.encrypt(multibyte))).toBe(multibyte);
    });
  });

  it('refuses an APP_KEY that does not decode to 32 bytes', () => {
    expect(() => new LaravelCryptService(configFor('base64:c2hvcnQ='))).toThrow(
      /must decode to 32 bytes/,
    );
  });
});
