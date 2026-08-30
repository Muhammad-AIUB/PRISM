import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { bigintTransformer } from '../transformers';
import { PullRequest } from './pull-request.entity';
import { ReviewComment } from './review-comment.entity';

/** Shape of one entry inside the `*_issues` JSON arrays. */
export interface ReviewIssue {
  file?: string;
  line?: number;
  severity?: 'critical' | 'warning' | 'suggestion';
  comment?: string;
}

/** One entry in `suggested_fixes.fixes`, as the second AI pass shapes it. */
export interface SuggestedFix {
  layer: 'security' | 'performance' | 'code_quality';
  file: string;
  line: number | null;
  original_issue: string;
  problematic_code: string;
  suggested_code: string;
  explanation: string;
}

/** `suggested_fixes` is an object wrapping a `fixes` array, not a bare array. */
export interface SuggestedFixes {
  fixes?: SuggestedFix[];
}

@Index('reviews_pr_created_idx', ['pullRequestId', 'createdAt'])
@Entity({ name: 'reviews' })
export class Review {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  pullRequestId!: number;

  @Column({ type: 'json', nullable: true })
  securityIssues!: ReviewIssue[] | null;

  @Column({ type: 'json', nullable: true })
  performanceIssues!: ReviewIssue[] | null;

  @Column({ type: 'json', nullable: true })
  codeQualityIssues!: ReviewIssue[] | null;

  /** 0–100. `unsignedTinyInteger` becomes smallint + CHECK on Postgres. */
  @Column({ type: 'smallint', nullable: true })
  overallScore!: number | null;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'json', nullable: true })
  suggestedFixes!: SuggestedFixes | null;

  @Column({ type: 'varchar', nullable: true })
  aiModelUsed!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;

  @OneToOne(() => PullRequest, (pullRequest) => pullRequest.review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pull_request_id' })
  pullRequest!: PullRequest;

  @OneToMany(() => ReviewComment, (comment) => comment.review)
  comments!: ReviewComment[];
}
