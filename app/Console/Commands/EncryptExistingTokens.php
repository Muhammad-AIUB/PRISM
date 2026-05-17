<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

#[Signature('db:tokens:encrypt')]
#[Description('Encrypt any github_token rows that are still stored in plaintext.')]
class EncryptExistingTokens extends Command
{
    /**
     * Operates at the DB level (DB::table) on purpose — once the cast is in
     * place, loading the User model would try to auto-decrypt the plaintext
     * value and crash.
     */
    public function handle(): int
    {
        $rows = DB::table('users')
            ->whereNotNull('github_token')
            ->select(['id', 'github_token'])
            ->get();

        $encrypted = 0;
        $alreadyEncrypted = 0;

        foreach ($rows as $row) {
            try {
                Crypt::decryptString($row->github_token);
                $alreadyEncrypted++;
                continue;
            } catch (\Throwable $e) {
                // Not encrypted; encrypt and write back.
            }

            DB::table('users')
                ->where('id', $row->id)
                ->update(['github_token' => Crypt::encryptString($row->github_token)]);

            $encrypted++;
        }

        $this->info("Encrypted: {$encrypted}");
        $this->line("Already encrypted: {$alreadyEncrypted}");

        return self::SUCCESS;
    }
}
