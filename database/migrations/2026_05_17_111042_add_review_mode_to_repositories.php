<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('repositories', function (Blueprint $table) {
            // 'pr_only' | 'commit_only' | 'both' — application-level validated.
            $table->string('review_mode', 32)->default('pr_only')->after('is_active');
            // JSON array of branch names to review when in commit / both mode.
            $table->json('review_branches')->nullable()->after('review_mode');
        });
    }

    public function down(): void
    {
        Schema::table('repositories', function (Blueprint $table) {
            $table->dropColumn(['review_mode', 'review_branches']);
        });
    }
};
