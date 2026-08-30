import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { bigintTransformer } from '../transformers';
import { Repository } from './repository.entity';
import { Review } from './review.entity';

export type PullRequestStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

@Index('pull_requests_repo_status_idx', ['repositoryId', 'status'])
@Index('pull_requests_repo_created_idx', ['repositoryId', 'createdAt'])
@Entity({ name: 'pull_requests' })
export class PullRequest {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  repositoryId!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  githubPrId!: number;

  @Column({ type: 'int' })
  prNumber!: number;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'varchar' })
  author!: string;

  @Column({ type: 'varchar' })
  baseBranch!: string;

  @Column({ type: 'varchar' })
  headBranch!: string;

  /**
   * Laravel's `enum()` compiles to varchar + CHECK constraint on Postgres, NOT
   * a native pg enum type. Declaring `type: 'enum'` here would make TypeORM
   * want to create a type that does not exist — keep it varchar.
   */
  @Column({ type: 'varchar', default: 'pending' })
  status!: PullRequestStatus;

  @Column({ type: 'varchar', nullable: true })
  diffUrl!: string | null;

  @Column({ type: 'json', nullable: true })
  detectedLanguages!: string[] | null;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;

  @ManyToOne(() => Repository, (repository) => repository.pullRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repository_id' })
  repository!: Repository;

  @OneToOne(() => Review, (review) => review.pullRequest)
  review!: Review | null;
}
