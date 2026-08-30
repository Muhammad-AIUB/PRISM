import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';

/**
 * Laravel Sanctum's token table, read as-is so tokens issued by the Laravel app
 * keep working against this service. Nothing here is re-hashed or re-issued.
 */
@Entity({ name: 'personal_access_tokens' })
export class PersonalAccessToken {
  @PrimaryColumn({ type: 'bigint', generated: 'increment', transformer: bigintTransformer })
  id!: number;

  /** morphs('tokenable') → always 'App\Models\User' in PRism. */
  @Column({ type: 'varchar' })
  tokenableType!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  tokenableId!: number;

  @Column({ type: 'varchar' })
  name!: string;

  /** sha256 hex of the plaintext half of "{id}|{plaintext}". */
  @Column({ type: 'varchar', length: 64, unique: true })
  token!: string;

  /** JSON-encoded array of ability strings, e.g. '["*"]'. */
  @Column({ type: 'text', nullable: true })
  abilities!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;
}
