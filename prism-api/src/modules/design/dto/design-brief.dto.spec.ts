import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DesignBriefDto, toBrief } from './design-brief.dto';

/** The same two steps the global ValidationPipe runs, in the same order. */
function validate(body: Record<string, unknown>) {
  const dto = plainToInstance(DesignBriefDto, body);

  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
}

describe('DesignBriefDto', () => {
  it('rejects a product that is only whitespace, however long', () => {
    const { errors } = validate({ product: ' '.repeat(40) });

    expect(errors.map((e) => e.property)).toEqual(['product']);
  });

  it('measures length after trimming, so padding cannot satisfy the minimum', () => {
    const { errors } = validate({ product: `   ${'x'.repeat(10)}${' '.repeat(20)}` });

    expect(errors.map((e) => e.property)).toEqual(['product']);
  });

  it('accepts a real description and hands the trimmed text to the brief', () => {
    const { dto, errors } = validate({
      product: '  A marketplace where bakeries take weekend pre-orders.  ',
      constraints: '  Go, EU only  ',
    });

    expect(errors).toEqual([]);
    expect(toBrief(dto)).toMatchObject({
      product: 'A marketplace where bakeries take weekend pre-orders.',
      constraints: 'Go, EU only',
      scale: 'startup',
      priorities: [],
    });
  });

  it('still rejects duplicate priorities', () => {
    const { errors } = validate({
      product: 'A marketplace where bakeries take weekend pre-orders.',
      priorities: ['low_cost', 'low_cost'],
    });

    expect(errors.map((e) => e.property)).toEqual(['priorities']);
  });
});
