<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commit_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('repository_id')->constrained()->cascadeOnDelete();
            $table->string('commit_sha', 64);
            $table->text('commit_message')->nullable();
            $table->string('author')->nullable();
            $table->string('branch');
            $table->string('status', 16)->default('pending'); // pending|analyzing|completed|failed
            $table->unsignedTinyInteger('overall_score')->nullable();
            $table->text('summary')->nullable();
            $table->json('security_issues')->nullable();
            $table->json('performance_issues')->nullable();
            $table->json('code_quality_issues')->nullable();
            $table->json('suggested_fixes')->nullable();
            $table->json('detected_languages')->nullable();
            $table->string('ai_model_used')->nullable();
            $table->timestamps();

            $table->unique(['repository_id', 'commit_sha'], 'commit_reviews_repo_sha_unique');
            $table->index(['repository_id', 'status'],     'commit_reviews_repo_status_idx');
            $table->index(['repository_id', 'created_at'], 'commit_reviews_repo_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commit_reviews');
    }
};
