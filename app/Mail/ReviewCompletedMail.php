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
        // Use Laravel's markdown mail template (rendered via the published
        // mail components in resources/views/vendor/mail).
        return new Content(
            markdown: 'emails.review-completed',
            with: [
                'pullRequest' => $this->pullRequest,
                'review'      => $this->review,
            ],
        );
    }
}
