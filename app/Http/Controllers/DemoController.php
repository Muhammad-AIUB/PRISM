<?php

namespace App\Http\Controllers;

use Inertia\Inertia;

/**
 * Public demo — lets evaluators (recruiters, prospective users) explore
 * the full UI with realistic sample data without going through the GitHub
 * OAuth flow. All data is hardcoded; no DB, no AI, no GitHub calls.
 */
class DemoController extends Controller
{
    /**
     * Sample reviews. Shared between the dashboard listing and the
     * per-review detail page so links stay consistent.
     */
    private function reviews(): array
    {
        return [
            [
                'id'         => 1,
                'pr_title'   => 'Add user authentication endpoint',
                'repo'       => 'ecommerce-api',
                'language'   => 'PHP',
                'score'      => 72,
                'status'     => 'completed',
                'created_at' => '2 hours ago',
                'issues' => [
                    [
                        'severity' => 'critical',
                        'type'     => 'Security',
                        'message'  => 'SQL injection vulnerability — user input concatenated directly into query',
                        'file'     => 'AuthController.php',
                        'line'     => 45,
                        'before'   => '$user = DB::select("SELECT * FROM users WHERE email = \'$email\'");',
                        'after'    => '$user = DB::select("SELECT * FROM users WHERE email = ?", [$email]);',
                    ],
                    [
                        'severity' => 'high',
                        'type'     => 'Security',
                        'message'  => 'Password stored without hashing',
                        'file'     => 'User.php',
                        'line'     => 23,
                        'before'   => '$user->password = $request->password;',
                        'after'    => '$user->password = Hash::make($request->password);',
                    ],
                    [
                        'severity' => 'medium',
                        'type'     => 'Performance',
                        'message'  => 'N+1 query detected — eager-load the relation',
                        'file'     => 'UserController.php',
                        'line'     => 67,
                        'before'   => "\$users = User::all();\nforeach (\$users as \$u) { echo \$u->profile->bio; }",
                        'after'    => "\$users = User::with('profile')->get();",
                    ],
                ],
            ],
            [
                'id'         => 2,
                'pr_title'   => 'Refactor payment processing',
                'repo'       => 'ecommerce-api',
                'language'   => 'PHP',
                'score'      => 88,
                'status'     => 'completed',
                'created_at' => '5 hours ago',
                'issues' => [
                    [
                        'severity' => 'medium',
                        'type'     => 'Code Quality',
                        'message'  => 'Function exceeds 50 lines — consider extracting helper methods',
                        'file'     => 'PaymentService.php',
                        'line'     => 112,
                        'before'   => 'public function process() { /* 60 lines */ }',
                        'after'    => 'public function process() { $this->validate(); $this->charge(); $this->notify(); }',
                    ],
                ],
            ],
            [
                'id'         => 3,
                'pr_title'   => 'Update React dashboard charts',
                'repo'       => 'react-dashboard',
                'language'   => 'JavaScript',
                'score'      => 95,
                'status'     => 'completed',
                'created_at' => '1 day ago',
                'issues'     => [],
            ],
        ];
    }

    public function index()
    {
        return Inertia::render('Demo/Dashboard', [
            'isDemo' => true,
            'stats' => [
                'repos'            => 3,
                'prs_reviewed'     => 47,
                'commits_reviewed' => 128,
                'avg_score'        => 82,
            ],
            'repositories' => [
                ['name' => 'ecommerce-api',    'language' => 'PHP',        'review_mode' => 'pr_only',     'reviews' => 23],
                ['name' => 'react-dashboard',  'language' => 'JavaScript', 'review_mode' => 'both',        'reviews' => 15],
                ['name' => 'go-microservice',  'language' => 'Go',         'review_mode' => 'commit_only', 'reviews' => 9],
            ],
            'recent_reviews' => $this->reviews(),
        ]);
    }

    public function review($id)
    {
        $review = collect($this->reviews())->firstWhere('id', (int) $id);
        abort_if(! $review, 404);

        return Inertia::render('Demo/ReviewDetail', [
            'isDemo' => true,
            'review' => $review,
        ]);
    }
}
