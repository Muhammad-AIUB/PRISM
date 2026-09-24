import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';
import { Repository } from './repository.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  githubId!: string | null;

  /** The original `encrypted` cast — ciphertext at rest. Decrypt via CryptService. */
  @Column({ type: 'text', nullable: true })
  githubToken!: string | null;

  @Column({ type: 'varchar', nullable: true })
  githubAvatar!: string | null;

  @Column({ type: 'varchar', nullable: true })
  githubUsername!: string | null;

  // users.email_notifications still exists in the database (default true) but
  // is deliberately not mapped: email notifications were removed, and dropping
  // the column is hand-applied DDL, a separate decision (see schema.sql).

  @Column({ type: 'varchar', nullable: true })
  slackWebhookUrl!: string | null;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt!: Date | null;

  /** bcrypt hash; nullable because GitHub-OAuth users have no password. */
  @Column({ type: 'varchar', nullable: true })
  password!: string | null;

  @Column({ type: 'varchar', nullable: true })
  rememberToken!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;

  @OneToMany(() => Repository, (repository) => repository.user)
  repositories!: Repository[];
}
