<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Repository extends Model
{
    use HasFactory;

    public const REVIEW_MODES = ['pr_only', 'commit_only', 'both'];

    protected $fillable = [
        'user_id',
        'name',
        'full_name',
        'github_repo_id',
        'webhook_id',
        'webhook_secret',
        'is_active',
        'review_mode',
        'review_branches',
    ];

    protected $attributes = [
        'review_mode' => 'pr_only',
    ];

    protected function casts(): array
    {
        return [
            'is_active'       => 'boolean',
            'github_repo_id'  => 'integer',
            'webhook_id'      => 'integer',
            'review_branches' => 'array',
        ];
    }

    /**
     * The GitHub webhook event list this repository's mode subscribes to.
     */
    public function webhookEvents(): array
    {
        return match ($this->review_mode) {
            'commit_only' => ['push'],
            'both'        => ['pull_request', 'push'],
            default       => ['pull_request'],
        };
    }

    /**
     * Effective list of branches to review on push events.
     */
    public function watchedBranches(): array
    {
        $branches = $this->review_branches;
        if (! is_array($branches) || empty($branches)) {
            return ['main', 'master'];
        }
        return array_values(array_filter(array_map('strval', $branches)));
    }

    // ── Relationships ────────────────────────────────────────────────

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function pullRequests(): HasMany
    {
        return $this->hasMany(PullRequest::class);
    }

    public function commitReviews(): HasMany
    {
        return $this->hasMany(CommitReview::class);
    }
}
