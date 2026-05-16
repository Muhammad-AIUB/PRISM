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
        Schema::create('review_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('review_id')->constrained()->cascadeOnDelete();
            $table->string('file_path');
            $table->unsignedInteger('line_number')->nullable();
            $table->enum('layer', ['security', 'performance', 'code_quality']);
            $table->enum('severity', ['critical', 'warning', 'suggestion']);
            $table->text('comment');
            $table->unsignedBigInteger('github_comment_id')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('review_comments');
    }
};
