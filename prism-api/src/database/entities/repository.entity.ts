import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { bigintTransformer } from '../transformers';
import { CommitReview } from './commit-review.entity';
import { PullRequest } from './pull-request.entity';
import { User } from './user.entity';

export type ReviewMode = 'pr_only' | 'commit_only' | 'both';

@Index('repositories_user_active_idx', ['userId', 'isActive'])
@Entity({ name: 'repositories' })
export class Repository {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  userId!: number;

  @Column({ type: 'varchar' })
  name!: string;

  /** e.g. "muhammad/my-repo" */
  @Column({ type: 'varchar' })
  fullName!: string;

  @Column({ type: 'bigint', unique: true, transformer: bigintTransformer })
  githubRepoId!: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  webhookId!: number | null;

  @Column({ type: 'varchar' })
  webhookSecret!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** Laravel stores this as varchar(32), validated in application code. */
  @Column({ type: 'varchar', length: 32, default: 'pr_only' })
  reviewMode!: ReviewMode;

  @Column({ type: 'json', nullable: true })
  reviewBranches!: string[] | null;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.repositories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @OneToMany(() => PullRequest, (pullRequest) => pullRequest.repository)
  pullRequests!: PullRequest[];

  @OneToMany(() => CommitReview, (commitReview) => commitReview.repository)
  commitReviews!: CommitReview[];
}
