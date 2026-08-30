import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';
import { Repository } from './repository.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  githubId!: string | null;

  /** Laravel `encrypted` cast — ciphertext at rest. Decrypt via LaravelCryptService. */
  @Column({ type: 'text', nullable: true })
  githubToken!: string | null;

  @Column({ type: 'varchar', nullable: true })
  githubAvatar!: string | null;

  @Column({ type: 'varchar', nullable: true })
  githubUsername!: string | null;

  @Column({ type: 'boolean', default: true })
  emailNotifications!: boolean;

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
