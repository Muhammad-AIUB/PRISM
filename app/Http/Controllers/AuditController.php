<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class AuditController extends Controller
{
    public function index()
    {
        $logs = Auth::user()
            ->auditLogs()
            ->orderByDesc('created_at')
            ->limit(200)
            ->get()
            ->map(fn ($log) => [
                'id'          => $log->id,
                'action'      => $log->action,
                'description' => $log->description,
                'metadata'    => $log->metadata,
                'ip_address'  => $log->ip_address,
                'created_at'  => optional($log->created_at)->toIso8601String(),
            ]);

        return Inertia::render('Security/AuditLog', [
            'logs' => $logs,
        ]);
    }
}
