import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { PersonalAccessToken, User } from '../database/entities';
import { randomString } from '../database/repository.helpers';
import { toIso8601String } from '../common/utils/iso8601';

/**
 * Issues and revokes Sanctum tokens, matching HasApiTokens::createToken().
 *
 * The format is load-bearing in both directions: SanctumAuthGuard reads these
 * rows, Laravel's Sanctum reads them too, and the MCP server already holds
 * tokens issued by the Laravel app. A token minted here must be
 * indistinguishable from one minted there.
 *
 *   plainTextToken = "{id}|{plaintext}"
 *   token column   = sha256(plaintext), hex
 *   abilities      = '["*"]'
 *   tokenable_type = 'App\Models\User'
 */
const TOKENABLE_TYPE = 'App\\Models\\User';
const PLAINTEXT_LENGTH = 40;

export interface ApiTokenDto {
  id: number;
  name: string;
  last_used_at: string | null;
  created_at: string | null;
}

@Injectable()
export class PersonalAccessTokenService {
  constructor(
    @InjectRepository(PersonalAccessToken)
    private readonly tokens: OrmRepository<PersonalAccessToken>,
  ) {}

  /** The Settings page's token list. */
  async listFor(user: User): Promise<ApiTokenDto[]> {
    const rows = await this.tokens.find({
      where: { tokenableType: TOKENABLE_TYPE, tokenableId: user.id },
      order: { id: 'ASC' },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      // Carbon's toIso8601String(), not JS's toISOString() — see iso8601.ts.
      last_used_at: toIso8601String(row.lastUsedAt),
      created_at: toIso8601String(row.createdAt),
    }));
  }

  /**
   * Returns the plaintext exactly once. Nothing stores it, and it cannot be
   * recovered from the row afterwards — only its sha256 is kept.
   */
  async create(user: User, name: string): Promise<{ token: ApiTokenDto; plainTextToken: string }> {
    const plaintext = randomString(PLAINTEXT_LENGTH);
    const now = new Date();

    const row = await this.tokens.save(
      this.tokens.create({
        tokenableType: TOKENABLE_TYPE,
        tokenableId: user.id,
        name,
        token: createHash('sha256').update(plaintext).digest('hex'),
        abilities: JSON.stringify(['*']),
        lastUsedAt: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    return {
      token: {
        id: row.id,
        name: row.name,
        last_used_at: null,
        created_at: toIso8601String(row.createdAt),
      },
      plainTextToken: `${row.id}|${plaintext}`,
    };
  }

  /**
   * Scoped to the owner's tokens, as Laravel's $user->tokens()->where(...) was.
   * Revoking by id alone would let any signed-in user delete anyone's token.
   */
  async revoke(user: User, tokenId: number): Promise<void> {
    await this.tokens.delete({
      id: tokenId,
      tokenableType: TOKENABLE_TYPE,
      tokenableId: user.id,
    });
  }
}
