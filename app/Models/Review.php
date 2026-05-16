<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Review extends Model
{
    use HasFactory;

    protected $fillable = [
        'pull_request_id',
        'security_issues',
        'performance_issues',
        'code_quality_issues',
        'overall_score',
        'summary',
        'ai_model_used',
    ];

    protected function casts(): array
    {
        return [
            'security_issues'     => 'array',
            'performance_issues'  => 'array',
            'code_quality_issues' => 'array',
            'overall_score'       => 'integer',
        ];
    }

    // ── Relationships ────────────────────────────────────────────────

    public function pullRequest(): BelongsTo
    {
        return $this->belongsTo(PullRequest::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(ReviewComment::class);
    }
}
