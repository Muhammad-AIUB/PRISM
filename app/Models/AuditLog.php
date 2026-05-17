<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'action',
        'description',
        'metadata',
        'ip_address',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'metadata'   => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Convenience helper used across the codebase to log an event.
     * Quietly no-ops if the user is null (e.g. queue jobs without a user
     * context). IP is read from the current request when available.
     */
    public static function record(?int $userId, string $action, string $description = '', array $metadata = []): void
    {
        if (! $userId) return;

        try {
            self::create([
                'user_id'     => $userId,
                'action'      => $action,
                'description' => $description,
                'metadata'    => $metadata ?: null,
                'ip_address'  => request()?->ip(),
                'created_at'  => now(),
            ]);
        } catch (\Throwable $e) {
            // Audit logging must never break the primary flow.
            \Illuminate\Support\Facades\Log::warning('AuditLog write failed', ['error' => $e->getMessage()]);
        }
    }
}
