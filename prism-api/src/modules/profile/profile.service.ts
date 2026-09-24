import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository as OrmRepository } from 'typeorm';
import { compare } from 'bcryptjs';
import { User } from '../../database/entities';
import { AccountDataService } from '../account/account-data.service';
import type { UpdateProfileDto } from './dto/profile.dto';

/**
 * Port of App\Http\Controllers\ProfileController.
 *
 * Validation errors use the original's { message, errors } envelope so the existing
 * form components keep working — ApiExceptionFilter shapes the response,
 * this just supplies the field keys and messages.
 */
@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly users: OrmRepository<User>,
    private readonly accountData: AccountDataService,
  ) {}

  /**
   * The User model never implemented MustVerifyEmail (the import is commented
   * out), so this is false today. Kept as a field rather than dropped, because
   * the Profile/Edit page branches on it.
   */
  edit(): { mustVerifyEmail: boolean; status: string | null } {
    return { mustVerifyEmail: false, status: null };
  }

  async update(user: User, dto: UpdateProfileDto): Promise<{ user: Partial<User> }> {
    const taken = await this.users.findOne({
      where: { email: dto.email, id: Not(user.id) },
      select: { id: true },
    });

    if (taken) {
      throw new UnprocessableEntityException({
        message: 'The email has already been taken.',
        errors: { email: ['The email has already been taken.'] },
      });
    }

    const changes: Partial<User> = { name: dto.name, email: dto.email, updatedAt: new Date() };

    // The original: isDirty('email') → re-verification is required again.
    if (dto.email !== user.email) {
      changes.emailVerifiedAt = null;
    }

    await this.users.update(user.id, changes);

    return { user: { ...user, ...changes } };
  }

  /**
   * The original's `current_password` rule. Note that GitHub-OAuth users have a
   * NULL password, so this path is unreachable for them in the original too — they
   * cannot delete their account here, only via Security → My Data.
   */
  async destroy(user: User, password: string): Promise<void> {
    const stored = user.password;

    if (!stored || !(await compare(password, stored))) {
      throw new UnprocessableEntityException({
        message: 'The password is incorrect.',
        errors: { password: ['The password is incorrect.'] },
      });
    }

    // repositories and audit_logs cascade from users, and pull_requests,
    // commit_reviews, reviews and review_comments cascade on down from there.
    //
    // personal_access_tokens does NOT: The original token scheme uses a polymorphic
    // tokenable_type/tokenable_id pair with no foreign key, so those rows are
    // left behind here exactly as they are in the original. They cannot be used to
    // authenticate — ApiTokenAuthGuard looks the user up and finds nothing —
    // but they do accumulate.
    //
    // Redis-held data (designs, saved risk) is outside that cascade, so it is
    // erased first; a failure there stops the deletion rather than leaving it.
    await this.accountData.erase(user);
    await this.users.delete(user.id);
  }
}
