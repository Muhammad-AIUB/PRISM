<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('github_id')->unique()->nullable()->after('id');
            $table->string('github_token')->nullable()->after('github_id');
            $table->string('github_avatar')->nullable()->after('github_token');
            $table->string('github_username')->nullable()->after('github_avatar');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['github_id', 'github_token', 'github_avatar', 'github_username']);
        });
    }
};
