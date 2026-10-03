// @Type() reads decorator metadata, which main.ts loads for the real app.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RepositoryReviewsQueryDto } from './repository.dto';

/** Query strings arrive as text; these are the shapes a URL can carry. */
describe('RepositoryReviewsQueryDto', () => {
  const errorsFor = async (query: Record<string, string>) =>
    validate(plainToInstance(RepositoryReviewsQueryDto, query));

  it('accepts an empty query', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts both kinds and turns the page into a number', async () => {
    const dto = plainToInstance(RepositoryReviewsQueryDto, { kind: 'commits', page: '3' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(await errorsFor({ kind: 'prs' })).toHaveLength(0);
  });

  it.each(['pr', 'all', ''])('refuses kind %p', async (kind) => {
    expect(await errorsFor({ kind })).not.toHaveLength(0);
  });

  // 1e20 parses as an integer and then overflows the OFFSET, which is a 500.
  it.each(['0', '-1', '1.5', 'abc', '99999999999999999999'])('refuses page %p', async (page) => {
    expect(await errorsFor({ page })).not.toHaveLength(0);
  });
});
