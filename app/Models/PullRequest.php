<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class PullRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'repository_id',
        'github_pr_id',
        'pr_number',
        'title',
        'author',
        'base_branch',
        'head_branch',
        'status',
        'diff_url',
    ];

    protected function casts(): array
    {
        return [
            'github_pr_id' => 'integer',
            'pr_number'    => 'integer',
        ];
    }

    // ── Relationships ────────────────────────────────────────────────

    public function repository(): BelongsTo
    {
        return $this->belongsTo(Repository::class);
    }

    public function review(): HasOne
    {
        return $this->hasOne(Review::class);
    }
}
