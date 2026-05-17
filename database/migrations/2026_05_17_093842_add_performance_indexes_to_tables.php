<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('repositories', function (Blueprint $table) {
            $table->index(['user_id', 'is_active'], 'repositories_user_active_idx');
        });

        Schema::table('pull_requests', function (Blueprint $table) {
            $table->index(['repository_id', 'status'],     'pull_requests_repo_status_idx');
            $table->index(['repository_id', 'created_at'], 'pull_requests_repo_created_idx');
        });

        Schema::table('reviews', function (Blueprint $table) {
            $table->index(['pull_request_id', 'created_at'], 'reviews_pr_created_idx');
        });

        Schema::table('review_comments', function (Blueprint $table) {
            $table->index(['review_id', 'severity'], 'review_comments_review_severity_idx');
            $table->index(['review_id', 'layer'],    'review_comments_review_layer_idx');
        });
    }

    public function down(): void
    {
        Schema::table('repositories', function (Blueprint $table) {
            $table->dropIndex('repositories_user_active_idx');
        });
        Schema::table('pull_requests', function (Blueprint $table) {
            $table->dropIndex('pull_requests_repo_status_idx');
            $table->dropIndex('pull_requests_repo_created_idx');
        });
        Schema::table('reviews', function (Blueprint $table) {
            $table->dropIndex('reviews_pr_created_idx');
        });
        Schema::table('review_comments', function (Blueprint $table) {
            $table->dropIndex('review_comments_review_severity_idx');
            $table->dropIndex('review_comments_review_layer_idx');
        });
    }
};
