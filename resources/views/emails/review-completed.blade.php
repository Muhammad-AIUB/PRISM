@component('mail::message')
# 🔍 PRism Review Complete

Hey **{{ $pullRequest->repository->user->name ?? $pullRequest->repository->user->github_username }}**,

Your pull request **"{{ $pullRequest->title }}"** has been reviewed by PRism AI.

## Score: {{ $review->overall_score ?? 'N/A' }}/100

**Summary:**
{{ $review->summary ?? '_No summary provided._' }}

**Repository:** {{ $pullRequest->repository->full_name }}
**Author:** {{ $pullRequest->author }}
**Branch:** `{{ $pullRequest->head_branch }}` → `{{ $pullRequest->base_branch }}`

@component('mail::button', ['url' => url("/reviews/{$pullRequest->id}")])
View Full Review
@endcomponent

Thanks,<br>
PRism AI
@endcomponent
