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
  /** Set when GitHub refused the listing; `repos` is then empty for that reason. */
  githubError?: { status: number } | null;
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
/** `not_reviewed`: no model produced a review, so nothing was checked. Never an all-clear. */
export type Verdict = 'blocking' | 'worth_a_look' | 'nothing_found' | 'not_reviewed';

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
  stats: {
    connected_repos: number;
    total_reviews: number;
    audit_events: number;
    /**
     * Held in Redis, not Postgres, and erased with the account. Null when
     * Redis could not be read: "unknown", which is not the same as zero.
     */
    saved_designs: number | null;
    saved_risk_assessments: number | null;
  };
  designs: BlueprintSummary[] | null;
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

// ── Risk Radar ───────────────────────────────────────────────────────
// Mirrors prism-api/src/diff/risk-radar.ts. Deterministic, computed from the
// diff on request; nothing here is stored.

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskSignal {
  id: string;
  label: string;
  weight: number;
  detail: string;
  files: string[];
}

export interface ReliabilityCheck {
  id: string;
  question: string;
  why: string;
  files: string[];
}

/**
 * Which revision a risk assessment describes. `reviewed` is the exact diff the
 * review on the page read; `current` is the pull request's head right now,
 * served only when no reviewed-revision assessment exists.
 */
export type RiskBasis = 'reviewed' | 'current';

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  stats: {
    files: number;
    additions: number;
    deletions: number;
    sourceFiles: number;
    testFiles: number;
  };
  signals: RiskSignal[];
  checklist: ReliabilityCheck[];
}

// ── Design Studio ────────────────────────────────────────────────────
// Mirrors prism-api/src/design/blueprint.ts.

export type DesignScale = 'prototype' | 'startup' | 'growth' | 'enterprise';

export type DesignPriority =
  | 'high_availability'
  | 'low_latency'
  | 'strong_consistency'
  | 'low_cost'
  | 'fast_delivery'
  | 'security_compliance'
  | 'offline_first';

export interface DesignBrief {
  product: string;
  scale: DesignScale;
  priorities: DesignPriority[];
  constraints: string;
}

export interface Blueprint {
  id: string;
  title: string;
  summary: string;
  architecture_style: string;
  components: { name: string; responsibility: string; technology: string; why: string }[];
  data_stores: { name: string; kind: string; holds: string; why: string }[];
  request_flow: string[];
  reliability: { pattern: string; where: string; why: string }[];
  failure_modes: { failure: string; impact: string; mitigation: string; detection: string }[];
  scaling_stages: { stage: string; trigger: string; changes: string }[];
  tradeoffs: { decision: string; chosen: string; alternative: string; why: string }[];
  security: string[];
  observability: string[];
  slos: { name: string; target: string }[];
  risks: string[];
  first_milestones: string[];
  readiness_checklist: { id: string; item: string; why: string }[];
  brief: DesignBrief;
  source: 'ai' | 'baseline';
  model: string | null;
  notice: string | null;
  created_at: string;
}

export interface BlueprintSummary {
  id: string;
  title: string;
  scale: DesignScale;
  source: 'ai' | 'baseline';
  created_at: string;
}
