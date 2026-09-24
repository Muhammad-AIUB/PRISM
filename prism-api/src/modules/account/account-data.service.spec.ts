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
  const service = new AccountDataService(
    { createQueryBuilder: () => query } as never,
    designs as never,
    risk as never,
  );

  return { service, designs, risk };
}

describe('AccountDataService', () => {
  it('erases saved risk for every one of the user\'s pull requests, and all their designs', async () => {
    const { service, designs, risk } = build();

    await service.erase(user);

    expect(risk.purge).toHaveBeenCalledWith([41, 42]);
    expect(designs.purgeOwner).toHaveBeenCalledWith(1);
  });

  it('turns a storage failure into a 503 that says nothing was deleted', async () => {
    const { service } = build({ purgeOwner: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });

    const attempt = service.erase(user);

    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toThrow(/nothing was deleted/);
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

describe('SecurityService.deleteEverything', () => {
  function security(erase: jest.Mock) {
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
      { erase } as never,
    );

    return { service, users, github };
  }

  it('erases Redis-held data before anything irreversible', async () => {
    const erase = jest.fn().mockResolvedValue(undefined);
    const { service, users, github } = security(erase);

    await service.deleteEverything(user);

    const [erased] = erase.mock.invocationCallOrder;

    expect(erased).toBeLessThan(github.deleteWebhook.mock.invocationCallOrder[0] as number);
    expect(erased).toBeLessThan(users.delete.mock.invocationCallOrder[0] as number);
  });

  it('deletes nothing, and says so, when that erasure fails', async () => {
    const { service, users, github } = security(
      jest.fn().mockRejectedValue(new ServiceUnavailableException('nothing was deleted')),
    );

    await expect(service.deleteEverything(user)).rejects.toThrow('nothing was deleted');
    expect(github.deleteWebhook).not.toHaveBeenCalled();
    expect(users.delete).not.toHaveBeenCalled();
  });
});
