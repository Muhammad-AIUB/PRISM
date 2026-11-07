import type { BatchResult } from '../../ai/batch-merge';
import { CHECKPOINT_TTL_SECONDS } from './batching.config';
import { ReviewCheckpointStore, SAVE_BATCH_SCRIPT, type CheckpointRef } from './review-checkpoint.store';

const REF: CheckpointRef = { kind: 'pr', id: 7, ownerId: 3 };

const result = (index: number): BatchResult => ({
  index,
  model: 'groq/m',
  security: [],
  performance: [],
  code_quality: [],
  dropped: 0,
  score: 80,
  summary: 's',
});

function build(redis: Record<string, jest.Mock>) {
  return new ReviewCheckpointStore(redis as never);
}

describe('ReviewCheckpointStore', () => {
  it('saves through the erasure-marker script under an owner-prefixed key', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(1) };

    expect(await build(redis).save(REF, 'fp1', result(2))).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      SAVE_BATCH_SCRIPT,
      2,
      'review-batches:3:pr:7',
      'account:erased:3',
      'fp1',
      'b2',
      JSON.stringify(result(2)),
      CHECKPOINT_TTL_SECONDS,
    );
  });

  it('reports a refused write while the account is being erased', async () => {
    expect(await build({ eval: jest.fn().mockResolvedValue(0) }).save(REF, 'fp1', result(0))).toBe(false);
  });

  it('never throws on a Redis failure when saving', async () => {
    expect(await build({ eval: jest.fn().mockRejectedValue(new Error('down')) }).save(REF, 'fp1', result(0))).toBe(false);
  });

  it('loads the batches saved under the same fingerprint', async () => {
    const redis = {
      hgetall: jest.fn().mockResolvedValue({ fp: 'fp1', b0: JSON.stringify(result(0)), b2: JSON.stringify(result(2)) }),
    };
    const found = await build(redis).load(REF, 'fp1');

    expect([...found.keys()]).toEqual([0, 2]);
  });

  it('ignores a hash from a different diff or different settings', async () => {
    const redis = { hgetall: jest.fn().mockResolvedValue({ fp: 'old', b0: JSON.stringify(result(0)) }) };

    expect((await build(redis).load(REF, 'new')).size).toBe(0);
  });

  it('skips an entry that is not a batch result, and returns nothing when Redis fails', async () => {
    const odd = { hgetall: jest.fn().mockResolvedValue({ fp: 'fp1', b0: '{"index":0}', b1: 'not json' }) };

    expect((await build(odd).load(REF, 'fp1')).size).toBe(0);
    expect((await build({ hgetall: jest.fn().mockRejectedValue(new Error('down')) }).load(REF, 'fp1')).size).toBe(0);
  });

  it('keeps the good entries when a sibling is corrupt', async () => {
    const redis = {
      hgetall: jest.fn().mockResolvedValue({ fp: 'fp1', b0: 'not json', b1: JSON.stringify(result(1)), b2: '{"index":2}' }),
    };
    const found = await build(redis).load(REF, 'fp1');

    expect([...found.keys()]).toEqual([1]);
  });

  it('clears one review and swallows a failure', async () => {
    const redis = { del: jest.fn().mockResolvedValue(1) };

    await build(redis).clear(REF);

    expect(redis.del).toHaveBeenCalledWith('review-batches:3:pr:7');
    await expect(build({ del: jest.fn().mockRejectedValue(new Error('down')) }).clear(REF)).resolves.toBeUndefined();
  });

  it('purges every key of an owner across scan pages, and throws if it cannot', async () => {
    const redis = {
      scan: jest
        .fn()
        .mockResolvedValueOnce(['17', ['review-batches:3:pr:7']])
        .mockResolvedValueOnce(['0', ['review-batches:3:commit:9']]),
      del: jest.fn().mockResolvedValue(1),
    };

    await build(redis).purgeOwner(3);

    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'review-batches:3:*', 'COUNT', 100);
    expect(redis.del).toHaveBeenCalledTimes(2);
    await expect(build({ scan: jest.fn().mockRejectedValue(new Error('down')) }).purgeOwner(3)).rejects.toThrow('down');
  });
});
