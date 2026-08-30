<?php

/**
 * Step 2 of the crypt interop check — the one that actually proves anything.
 *
 * Decrypts the payloads emit-crypt-payloads.ts produced using Laravel's real
 * Encrypter, and then encrypts the same values with it so the Jest suite can
 * assert the TypeScript side reads Laravel's output too.
 *
 * Both directions matter:
 *   - PHP -> TS: the worker decrypts users.github_token written by Laravel
 *   - TS -> PHP: NestJS OAuth writes that column and Laravel still reads it
 *
 * Run from the repository root, after the TS step:
 *   npx --prefix prism-api ts-node prism-api/test/emit-crypt-payloads.ts
 *   php prism-api/test/verify-crypt-interop.php
 */

require __DIR__ . '/../../vendor/autoload.php';

use Illuminate\Encryption\Encrypter;

$fixtureDir = __DIR__ . '/fixtures';
$tsFile     = $fixtureDir . '/ts-encrypted.json';

if (! is_file($tsFile)) {
    fwrite(STDERR, "Missing {$tsFile}. Run emit-crypt-payloads.ts first.\n");
    exit(1);
}

$data   = json_decode(file_get_contents($tsFile), true);
$rawKey = base64_decode(substr($data['app_key'], strlen('base64:')));

$encrypter = new Encrypter($rawKey, 'AES-256-CBC');

$failures = 0;

foreach ($data['payloads'] as $name => $sample) {
    try {
        $decrypted = $encrypter->decrypt($sample['payload']);
    } catch (Throwable $e) {
        printf("  FAIL  %-12s Laravel could not decrypt: %s\n", $name, $e->getMessage());
        $failures++;
        continue;
    }

    if ($decrypted !== $sample['value']) {
        printf("  FAIL  %-12s expected %s, got %s\n", $name, var_export($sample['value'], true), var_export($decrypted, true));
        $failures++;
        continue;
    }

    printf("  ok    %-12s TS -> Laravel\n", $name);
}

// The other direction: hand Jest a set of genuinely Laravel-encrypted values.
$laravelPayloads = [];

foreach ($data['payloads'] as $name => $sample) {
    $laravelPayloads[$name] = [
        'value'   => $sample['value'],
        'payload' => $encrypter->encrypt($sample['value']),
    ];
}

file_put_contents(
    $fixtureDir . '/laravel-encrypted.json',
    json_encode(
        ['app_key' => $data['app_key'], 'payloads' => $laravelPayloads],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    ) . "\n"
);

if ($failures > 0) {
    fwrite(STDERR, "\n{$failures} sample(s) failed: NestJS is writing github_token in a format Laravel cannot read.\n");
    exit(1);
}

printf("\nAll %d samples round-tripped. Wrote fixtures/laravel-encrypted.json\n", count($data['payloads']));
