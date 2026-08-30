import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';
import { User } from './user.entity';

@Index('audit_logs_user_created_idx', ['userId', 'createdAt'])
@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  userId!: number;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  /** varchar(45) — wide enough for IPv6. */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  /** This table has created_at only — no updated_at. */
  @Column({ type: 'timestamp' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
