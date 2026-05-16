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
        Schema::create('pull_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('repository_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('github_pr_id');
            $table->unsignedInteger('pr_number');
            $table->string('title');
            $table->string('author');
            $table->string('base_branch');
            $table->string('head_branch');
            $table->enum('status', ['pending', 'analyzing', 'completed', 'failed'])->default('pending');
            $table->string('diff_url')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pull_requests');
    }
};
