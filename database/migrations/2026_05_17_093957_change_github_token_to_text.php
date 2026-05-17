<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Encrypted tokens (base64-encoded JSON envelope) are far longer than
        // raw GitHub tokens, so promote the column to TEXT.
        Schema::table('users', function (Blueprint $table) {
            $table->text('github_token')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('github_token')->nullable()->change();
        });
    }
};
