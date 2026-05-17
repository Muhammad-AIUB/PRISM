<?php

namespace App\Mail;

use App\Models\PullRequest;
use App\Models\Review;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ReviewCompletedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public PullRequest $pullRequest, public Review $review)
    {
    }

    public function envelope(): Envelope
    {
        $score = $this->review->overall_score ?? 'N/A';
        return new Envelope(subject: "PRism Review Complete - Score: {$score}/100");
    }

    public function content(): Content
    {
        // Top 3 issues across all layers, prioritised by severity.
        $rank = ['critical' => 0, 'warning' => 1, 'suggestion' => 2];
        $topIssues = collect()
            ->merge($this->review->security_issues     ?? [])
            ->merge($this->review->performance_issues  ?? [])
            ->merge($this->review->code_quality_issues ?? [])
            ->sortBy(fn ($i) => $rank[$i['severity'] ?? 'suggestion'] ?? 3)
            ->take(3)
            ->values();

        return new Content(
            view: 'emails.review-completed',
            with: [
                'pr'        => $this->pullRequest,
                'review'    => $this->review,
                'user'      => $this->pullRequest->repository?->user,
                'topIssues' => $topIssues,
                'reviewUrl' => url('/reviews/'.$this->pullRequest->id),
            ],
        );
    }
}
