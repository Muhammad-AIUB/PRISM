import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../transformers';
import { Repository } from './repository.entity';
import type { ReviewIssue, SuggestedFixes } from './review.entity';

export type CommitReviewStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

@Unique('commit_reviews_repo_sha_unique', ['repositoryId', 'commitSha'])
@Index('commit_reviews_repo_status_idx', ['repositoryId', 'status'])
@Index('commit_reviews_repo_created_idx', ['repositoryId', 'createdAt'])
@Entity({ name: 'commit_reviews' })
export class CommitReview {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  repositoryId!: number;

  @Column({ type: 'varchar', length: 64 })
  commitSha!: string;

  @Column({ type: 'text', nullable: true })
  commitMessage!: string | null;

  @Column({ type: 'varchar', nullable: true })
  author!: string | null;

  @Column({ type: 'varchar' })
  branch!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: CommitReviewStatus;

  @Column({ type: 'smallint', nullable: true })
  overallScore!: number | null;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'json', nullable: true })
  securityIssues!: ReviewIssue[] | null;

  @Column({ type: 'json', nullable: true })
  performanceIssues!: ReviewIssue[] | null;

  @Column({ type: 'json', nullable: true })
  codeQualityIssues!: ReviewIssue[] | null;

  @Column({ type: 'json', nullable: true })
  suggestedFixes!: SuggestedFixes | null;

  @Column({ type: 'json', nullable: true })
  detectedLanguages!: string[] | null;

  @Column({ type: 'varchar', nullable: true })
  aiModelUsed!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;

  @ManyToOne(() => Repository, (repository) => repository.commitReviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repository_id' })
  repository!: Repository;

  /** Mirrors the Laravel model's shortSha() helper used in every API payload. */
  shortSha(): string {
    return this.commitSha.slice(0, 7);
  }
}
