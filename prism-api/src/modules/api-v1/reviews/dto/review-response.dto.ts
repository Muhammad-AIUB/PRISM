/**
 * Response contracts for /api/v1. Field names are snake_case because that is
 * what the PRism MCP server (mcp-server/index.js) reads — these interfaces are
 * the wire format, not internal models, so they do not follow TS conventions.
 */

export interface MeResponseDto {
  name: string;
  github_username: string | null;
  repositories: Array<{ id: number; name: string; full_name: string }>;
}

interface ReviewSummaryBase {
  id: number;
  repository: string | null;
  status: string;
  overall_score: number | null;
  created_at: string | null;
}

export interface CommitSummaryDto extends ReviewSummaryBase {
  type: 'commit';
  commit_sha: string;
  commit_message: string | null;
  branch: string;
}

export interface PullRequestSummaryDto extends ReviewSummaryBase {
  type: 'pull_request';
  pr_number: number;
  title: string;
}

export type ReviewSummaryDto = CommitSummaryDto | PullRequestSummaryDto;

interface ReviewDetailShared {
  summary: string | null;
  security_issues: unknown[];
  performance_issues: unknown[];
  code_quality_issues: unknown[];
  suggested_fixes: unknown[];
  detected_languages: string[];
  ai_model_used: string | null;
}

export interface CommitDetailDto extends CommitSummaryDto, ReviewDetailShared {
  commit_sha_full: string;
  author: string | null;
}

export interface PullRequestDetailDto extends PullRequestSummaryDto, ReviewDetailShared {
  author: string;
  base_branch: string;
  head_branch: string;
}

export type ReviewDetailDto = CommitDetailDto | PullRequestDetailDto;

export interface ListReviewsResponseDto {
  reviews: ReviewSummaryDto[];
}

export interface ShowReviewResponseDto {
  review: ReviewDetailDto;
}

export interface LatestReviewResponseDto {
  type: 'commit' | 'pull_request';
  review: ReviewDetailDto;
}
