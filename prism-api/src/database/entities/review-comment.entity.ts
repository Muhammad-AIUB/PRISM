import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';
import { Review } from './review.entity';

export type ReviewLayer = 'security' | 'performance' | 'code_quality';
export type ReviewSeverity = 'critical' | 'warning' | 'suggestion';

@Index('review_comments_review_severity_idx', ['reviewId', 'severity'])
@Index('review_comments_review_layer_idx', ['reviewId', 'layer'])
@Entity({ name: 'review_comments' })
export class ReviewComment {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  reviewId!: number;

  @Column({ type: 'varchar' })
  filePath!: string;

  @Column({ type: 'int', nullable: true })
  lineNumber!: number | null;

  @Column({ type: 'varchar' })
  layer!: ReviewLayer;

  @Column({ type: 'varchar' })
  severity!: ReviewSeverity;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  githubCommentId!: number | null;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;

  @ManyToOne(() => Review, (review) => review.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review!: Review;
}
