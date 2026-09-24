import { ServiceUnavailableException } from '@nestjs/common';
import type { User } from '../../database/entities';
import { SecurityService } from '../security/security.service';
import { AccountDataService } from './account-data.service';

const user = { id: 1, githubToken: null } as User;

function build(overrides: { purgeOwner?: jest.Mock; purge?: jest.Mock } = {}) {
  const query = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    // node-postgres returns bigint ids as strings; they must come back as numbers.
    getRawMany: jest.fn().mockResolvedValue([{ id: '41' }, { id: '42' }]),
  };
  const designs = {
    purgeOwner: overrides.purgeOwner ?? jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(3),
    list: jest.fn().mockResolvedValue([
      { id: 'd1', title: 'T', brief: { scale: 'startup' }, source: 'ai', created_at: 'x' },
    ]),
  };
  const risk = {
    purge: overrides.purge ?? jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(2),
  };
  const redis = { set: jest.fn().mockResolvedValue('OK') };
  const service = new AccountDataService(
    { createQueryBuilder: () => query } as never,
    designs as never,
    risk as never,
    redis as never,
  );

  return { service, designs, risk, redis };
}

describe('AccountDataService.deleteAccount', () => {
  const MARKER = 'account:erased:1';

  function withRedis() {
    const built = build();
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    Object.assign(built.service, { redis });

    return { ...built, redis };
  }

  it('sets the marker, purges Redis, then deletes the rows - in that order', async () => {
    const { service, designs, risk, redis } = withRedis();
    const deleteRows = jest.fn().mockResolvedValue(undefined);

    await service.deleteAccount(user, deleteRows);

    const order = [
      redis.set.mock.invocationCallOrder[0],
      risk.purge.mock.invocationCallOrder[0],
      designs.purgeOwner.mock.invocationCallOrder[0],
      deleteRows.mock.invocationCallOrder[0],
    ] as number[];

    expect(redis.set).toHaveBeenCalledWith(MARKER, '1', 'EX', expect.any(Number));
    expect(risk.purge).toHaveBeenCalledWith([41, 42]);
    expect(designs.purgeOwner).toHaveBeenCalledWith(1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // On success the marker stays and expires: a review still running for
    // this id may yet try to save, and the marker is what refuses it.
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('clears the marker and keeps the account when a purge fails', async () => {
    const { service, designs, redis } = withRedis();
    const deleteRows = jest.fn();

    designs.purgeOwner.mockRejectedValue(new Error('ECONNREFUSED'));

    const attempt = service.deleteAccount(user, deleteRows);

    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toThrow(/has not been deleted/);
    expect(deleteRows).not.toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith(MARKER);
  });

  it('clears the marker when deleting the rows fails after the purge', async () => {
    const { service, redis } = withRedis();

    await expect(
      service.deleteAccount(user, jest.fn().mockRejectedValue(new Error('deadlock detected'))),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(redis.del).toHaveBeenCalledWith(MARKER);
  });

  it('never claims nothing was deleted: saved risk may already be gone', async () => {
    const { service, designs } = withRedis();

    designs.purgeOwner.mockRejectedValue(new Error('x'));

    await expect(service.deleteAccount(user, jest.fn())).rejects.not.toThrow(/nothing was deleted/);
  });

  it('still reports the failure when clearing the marker also fails', async () => {
    const { service, designs, redis } = withRedis();

    designs.purgeOwner.mockRejectedValue(new Error('x'));
    redis.del.mockRejectedValue(new Error('still down'));

    await expect(service.deleteAccount(user, jest.fn())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports what is held outside the database for the data export', async () => {
    const { service } = build();

    await expect(service.summary(user)).resolves.toEqual({
      saved_designs: 3,
      designs: [{ id: 'd1', title: 'T', scale: 'startup', source: 'ai', created_at: 'x' }],
      saved_risk_assessments: 2,
    });
  });
});

describe('AccountDataService.summary when Redis is down', () => {
  it('reports the Redis figures as unknown instead of failing the page', async () => {
    const { service, designs } = build();

    designs.count.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.summary(user)).resolves.toEqual({
      saved_designs: null,
      designs: null,
      saved_risk_assessments: null,
    });
  });
});

describe('SecurityService.deleteEverything', () => {
  function security(deleteAccount: jest.Mock) {
    const users = { delete: jest.fn().mockResolvedValue(undefined) };
    const github = { deleteWebhook: jest.fn().mockResolvedValue(undefined) };
    const service = new SecurityService(
      users as never,
      { find: jest.fn().mockResolvedValue([{ fullName: 'o/r', webhookId: 9 }]) } as never,
      {} as never,
      {} as never,
      github as never,
      { decrypt: () => 'token' } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { deleteAccount } as never,
    );

    return { service, users, github };
  }

  it('does every irreversible step inside deleteAccount, after its Redis purge', async () => {
    const order: string[] = [];
    const deleteAccount = jest.fn(async (_user: User, deleteRows: () => Promise<void>) => {
      order.push('redis purged');
      await deleteRows();
    });
    const { service, users, github } = security(deleteAccount);

    github.deleteWebhook.mockImplementation(async () => void order.push('webhook removed'));
    users.delete.mockImplementation(async () => void order.push('user deleted'));

    await expect(service.deleteEverything(user)).resolves.toEqual({
      message: 'All your data has been permanently deleted.',
    });
    expect(order).toEqual(['redis purged', 'webhook removed', 'user deleted']);
  });

  it('deletes nothing, and says so, when deleteAccount fails before the rows', async () => {
    const { service, users, github } = security(
      jest.fn().mockRejectedValue(new ServiceUnavailableException('it has not been deleted')),
    );

    await expect(service.deleteEverything(user)).rejects.toThrow('it has not been deleted');
    expect(github.deleteWebhook).not.toHaveBeenCalled();
    expect(users.delete).not.toHaveBeenCalled();
  });
});
