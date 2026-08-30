/**
 * Step 1 of the crypt interop check.
 *
 * Encrypts a set of sample values with LaravelCryptService and writes them out
 * for verify-crypt-interop.php to decrypt using Laravel's own Encrypter. If
 * this service's output ever stops being readable by PHP, that script fails —
 * which matters because NestJS writes users.github_token and the Laravel app
 * still reads it through the `encrypted` cast.
 *
 *   npx ts-node test/emit-crypt-payloads.ts
 *   php test/verify-crypt-interop.php
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { LaravelCryptService } from '../src/common/utils/laravel-crypt.service';

/** Fixed test key — never a real APP_KEY. */
const APP_KEY = 'base64:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';

const SAMPLES: Record<string, string> = {
  simple: 'gho_abcdef1234567890',
  empty: '',
  quotes: 'token"with\'quotes',
  multibyte: 'টোকেন-বাংলা-émoji-🔍',
  long: 'x'.repeat(500),
  newlines: 'line1\nline2\r\nline3',
  json_like: '{"nested":"json","n":1}',
};

const config = {
  get: (key: string) => (key === 'app.key' ? APP_KEY : undefined),
} as unknown as ConfigService;

const crypt = new LaravelCryptService(config);

const payloads = Object.fromEntries(
  Object.entries(SAMPLES).map(([name, value]) => [name, { value, payload: crypt.encrypt(value) }]),
);

// Prove the service can at least read its own output before asking PHP to.
for (const [name, { value, payload }] of Object.entries(payloads)) {
  const roundTripped = crypt.decrypt(payload);

  if (roundTripped !== value) {
    throw new Error(`TS round trip failed for "${name}": ${String(roundTripped)} !== ${value}`);
  }
}

const path = join(__dirname, 'fixtures', 'ts-encrypted.json');

writeFileSync(path, `${JSON.stringify({ app_key: APP_KEY, payloads }, null, 2)}\n`, 'utf8');

console.log(`TS round trip OK for ${Object.keys(payloads).length} samples. Wrote ${path}`);
