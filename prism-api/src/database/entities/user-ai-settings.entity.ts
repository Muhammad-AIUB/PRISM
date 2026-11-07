import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';

@Entity({ name: 'user_ai_settings' })
export class UserAiSettings {
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  userId!: number;

  @Column({ type: 'varchar' })
  provider!: string;

  @Column({ type: 'varchar' })
  model!: string;

  /** Ciphertext. Only UserAiSettingsService reads or writes it. */
  @Column({ type: 'text' })
  apiKey!: string;

  @Column({ type: 'varchar' })
  keyHint!: string;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;
}
