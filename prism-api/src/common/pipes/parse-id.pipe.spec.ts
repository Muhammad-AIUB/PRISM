import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ParseIdPipe } from './parse-id.pipe';

const meta = { type: 'param' as const };

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();

  it('passes ordinary ids through as numbers', async () => {
    await expect(pipe.transform('42', meta)).resolves.toBe(42);
    await expect(pipe.transform(String(Number.MAX_SAFE_INTEGER), meta)).resolves.toBe(Number.MAX_SAFE_INTEGER);
  });

  it('answers an id too large to exist with 404, not a 500 from Postgres', async () => {
    await expect(pipe.transform('99999999999999999999', meta)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps ParseIntPipe\'s 400 for input that is not a number at all', async () => {
    await expect(pipe.transform('abc', meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform('abc', meta)).rejects.toThrow('Validation failed (numeric string is expected)');
  });
});
