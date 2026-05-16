<?php

namespace App\Mail;

use App\Models\PullRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ReviewCompleted extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public PullRequest $pullRequest)
    {
    }

    public function envelope(): Envelope
    {
        $score = $this->pullRequest->review?->overall_score ?? 'N/A';
        return new Envelope(
            subject: "PRism Review Complete - Score: {$score}/100",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.review-completed',
            with: [
                'pr'     => $this->pullRequest,
                'review' => $this->pullRequest->review,
                'url'    => url('/reviews/'.$this->pullRequest->id),
            ],
        );
    }
}
