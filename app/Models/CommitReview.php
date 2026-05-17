<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommitReview extends Model
{
    use HasFactory;

    protected $fillable = [
        'repository_id',
        'commit_sha',
        'commit_message',
        'author',
        'branch',
        'status',
        'overall_score',
        'summary',
        'security_issues',
        'performance_issues',
        'code_quality_issues',
        'suggested_fixes',
        'detected_languages',
        'ai_model_used',
    ];

    protected function casts(): array
    {
        return [
            'overall_score'       => 'integer',
            'security_issues'     => 'array',
            'performance_issues'  => 'array',
            'code_quality_issues' => 'array',
            'suggested_fixes'     => 'array',
            'detected_languages'  => 'array',
        ];
    }

    public function repository(): BelongsTo
    {
        return $this->belongsTo(Repository::class);
    }

    /** First 7 chars of the SHA — handy for display. */
    public function shortSha(): string
    {
        return substr($this->commit_sha, 0, 7);
    }
}
