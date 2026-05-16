<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReviewComment extends Model
{
    use HasFactory;

    protected $fillable = [
        'review_id',
        'file_path',
        'line_number',
        'layer',
        'severity',
        'comment',
        'github_comment_id',
    ];

    protected function casts(): array
    {
        return [
            'line_number'       => 'integer',
            'github_comment_id' => 'integer',
        ];
    }

    // ── Relationships ────────────────────────────────────────────────

    public function review(): BelongsTo
    {
        return $this->belongsTo(Review::class);
    }
}
