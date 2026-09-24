import { UnprocessableEntityException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import type { User } from '../../database/entities';
import { ProfileService } from './profile.service';

function build(taken: unknown = null) {
  const users = {
    findOne: jest.fn().mockResolvedValue(taken),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const accountData = {
    deleteAccount: jest.fn(async (_user: User, deleteRows: () => Promise<void>) => deleteRows()),
  };

  return { service: new ProfileService(users as never, accountData as never), users, accountData };
}

const base = { id: 3, name: 'Ada', email: 'ada@example.com', password: null } as unknown as User;

describe('ProfileService.update', () => {
  it("refuses another account's email with the 422 envelope the form reads", async () => {
    const { service, users } = build({ id: 9 });

    const error = await service
      .update(base, { name: 'Ada', email: 'taken@example.com' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      message: 'The email has already been taken.',
      errors: { email: ['The email has already been taken.'] },
    });
    expect(users.update).not.toHaveBeenCalled();
  });

  it('requires re-verification when the email changes', async () => {
    const { service, users } = build();

    await service.update(base, { name: 'Ada L', email: 'new@example.com' });

    expect(users.update).toHaveBeenCalledWith(3, expect.objectContaining({
      name: 'Ada L',
      email: 'new@example.com',
      emailVerifiedAt: null,
    }));
  });

  it('keeps verification when only the name changes', async () => {
    const { service, users } = build();

    await service.update(base, { name: 'Ada L', email: 'ada@example.com' });

    expect(users.update.mock.calls[0]?.[1]).not.toHaveProperty('emailVerifiedAt');
  });
});

describe('ProfileService.destroy', () => {
  it('deletes the account, through AccountDataService, on the right password', async () => {
    const { service, users, accountData } = build();
    const user = { ...base, password: await hash('correct horse', 4) } as User;

    await service.destroy(user, 'correct horse');

    // Through AccountDataService so Redis-held designs and risk go too.
    expect(accountData.deleteAccount).toHaveBeenCalledWith(user, expect.any(Function));
    expect(users.delete).toHaveBeenCalledWith(3);
  });

  it('refuses a wrong password and deletes nothing', async () => {
    const { service, users, accountData } = build();
    const user = { ...base, password: await hash('correct horse', 4) } as User;

    await expect(service.destroy(user, 'wrong')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(accountData.deleteAccount).not.toHaveBeenCalled();
    expect(users.delete).not.toHaveBeenCalled();
  });

  it('refuses every password for a GitHub-only account, which has none', async () => {
    const { service, users } = build();

    await expect(service.destroy(base, '')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(users.delete).not.toHaveBeenCalled();
  });
});
