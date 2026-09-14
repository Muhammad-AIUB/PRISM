/**
 * Shapes returned by prism-api, which in turn reproduce the props the previous
 * pages received. Field names stay snake_case for that reason — renaming them
 * would mean diverging from the API and from the pages being ported.
 */

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  github_username: string | null;
  github_avatar: string | null;
  email_notifications: boolean;
}

export interface RepositorySummary {
  name: string | null;
  full_name: string | null;
}

export type ReviewStatus = 'pending' | 'analyzing' | 'completed' | 'failed';
export type Severity = 'critical' | 'warning' | 'suggestion';
export type Layer = 'security' | 'performance' | 'code_quality';

export interface ReviewIssue {
  file?: string;
  line?: number;
  /**
   * Which side of the diff `line` counts on. A removed line has no new-side
   * number, so it is reported against its old one — showing that bare would
   * point the reader at whatever now occupies that position. Absent on reviews
   * written before the API started validating locations.
   */
  side?: 'added' | 'removed';
  /**
   * What kind of problem this claims to be. The first three are the ones a
   * reader can confirm against the diff in seconds, which is what lets the
   * verdict say "blocking" and mean it. Absent on older reviews.
   */
  category?:
    | 'auth_weakened'
    | 'contract_changed'
    | 'no_timeout'
    | 'error_swallowed'
    | 'untested_change'
    | 'migration_no_rollback'
    | 'other';
  severity?: Severity;
  comment?: string;
}

export interface SuggestedFix {
  layer: Layer;
  file: string;
  line: number | null;
  original_issue: string;
  problematic_code: string;
  suggested_code: string;
  explanation: string;
}

export interface SuggestedFixes {
  fixes?: SuggestedFix[];
}

export interface FeedItem {
  kind: 'pr' | 'commit';
  id: number;
  title: string;
  author: string | null;
  status: ReviewStatus;
  pr_number?: number;
  short_sha?: string;
  branch?: string;
  created_at: string | null;
  repository: RepositorySummary;
  score: number | null;
  url: string;
}

export interface DashboardData {
  total_repos: number;
  total_prs: number;
  total_commits: number;
  avg_score: number | null;
  recent_prs: FeedItem[];
  recent_commits: FeedItem[];
  timeline: { date: string | null; score: number; pr: string }[];
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  private?: boolean;
  language?: string | null;
  description?: string | null;
  updated_at?: string;
  html_url?: string;
}

export interface ConnectedRepo {
  id: number;
  github_repo_id: number;
  full_name: string;
  review_mode: string;
  review_branches: string[] | null;
}

export interface RepositoriesIndexData {
  repos: GithubRepo[];
  connectedIds: number[];
  connectedRepos: Record<string, ConnectedRepo>;
  reviewModes: string[];
}

export interface RepositorySettingsData {
  repository: {
    id: number;
    name: string;
    full_name: string;
    review_mode: string;
    review_branches: string[];
  };
  reviewModes: string[];
}

export interface Branch {
  name: string;
  is_default: boolean;
}

export interface PullRequestDetail {
  id: number;
  title: string;
  author: string;
  pr_number: number;
  base_branch: string;
  head_branch: string;
  status: ReviewStatus;
  diff_url: string | null;
  detected_languages: string[];
  created_at: string | null;
  repository: RepositorySummary;
}

export interface ReviewComment {
  id: number;
  file_path: string;
  line_number: number | null;
  layer: Layer;
  severity: Severity;
  comment: string;
}

/**
 * The answer to "should this stop me merging". Derived on the API from the
 * findings that survived validation, so every surface agrees rather than each
 * one deciding for itself. `blocking` requires a category a reader can confirm
 * against the diff, not just a severity the model chose.
 */
export type Verdict = 'blocking' | 'worth_a_look' | 'nothing_found';

export interface ReviewDetail {
  id: number;
  overall_score: number | null;
  /** Absent on reviews written before verdicts existed. */
  verdict?: Verdict;
  /** All three layers merged and ordered worst-first by the API. */
  findings?: ReviewIssue[];
  summary: string | null;
  ai_model_used: string | null;
  security_issues: ReviewIssue[];
  performance_issues: ReviewIssue[];
  code_quality_issues: ReviewIssue[];
  suggested_fixes: SuggestedFixes | null;
  comments: ReviewComment[];
}

export interface CommitReviewDetail {
  id: number;
  commit_sha: string;
  short_sha: string;
  commit_message: string | null;
  author: string | null;
  branch: string;
  status: ReviewStatus;
  overall_score: number | null;
  verdict?: Verdict;
  findings?: ReviewIssue[];
  summary: string | null;
  security_issues: ReviewIssue[];
  performance_issues: ReviewIssue[];
  code_quality_issues: ReviewIssue[];
  suggested_fixes: SuggestedFixes | null;
  detected_languages: string[];
  ai_model_used: string | null;
  created_at: string | null;
  repository: RepositorySummary;
  github_url: string | null;
}

export interface ApiToken {
  id: number;
  name: string;
  last_used_at: string | null;
  created_at: string | null;
}

export interface SettingsData {
  user: {
    name: string;
    email: string;
    github_username: string | null;
    github_avatar: string | null;
    email_notifications: boolean;
    slack_webhook_url: string | null;
  };
  api_tokens: ApiToken[];
}

export interface AuditLogEntry {
  id: number;
  action: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | null;
}

export interface MyData {
  profile: {
    name: string;
    email: string;
    github_username: string | null;
    github_avatar: string | null;
    created_at: string | null;
  };
  token_preview: { first_4: string; last_4: string; length: number };
  stats: { connected_repos: number; total_reviews: number; audit_events: number };
  repositories: {
    full_name: string;
    created_at: string | null;
    is_active: boolean;
    review_mode: string;
  }[];
}

export interface SecurityIndexData {
  user: { github_username: string | null; github_avatar: string | null } | null;
  is_authenticated: boolean;
  github_app_url: string;
  github_repo_url: string;
}
