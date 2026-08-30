import type { ValidationError } from 'class-validator';
import { collectValidationErrors, laravelValidationException } from './laravel-validation';

const error = (
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError => ({ property, constraints, children }) as ValidationError;

describe('collectValidationErrors', () => {
  it('keys by the property name, not by parsing the message', () => {
    // A custom message need not begin with the field name; keying off
    // `property` is what makes that safe.
    const collected = collectValidationErrors([
      error('slack_webhook_url', { matches: 'Must be a Slack incoming webhook.' }),
    ]);

    expect(collected).toEqual({
      slack_webhook_url: ['Must be a Slack incoming webhook.'],
    });
  });

  it('collects every constraint on a field', () => {
    const collected = collectValidationErrors([
      error('email', { isEmail: 'email must be an email', matches: 'email must be lowercase' }),
    ]);

    expect(collected.email).toEqual(['email must be an email', 'email must be lowercase']);
  });

  it('uses Laravel dot notation for array items', () => {
    const collected = collectValidationErrors([
      error('review_branches', {}, [error('0', { isString: 'each value must be a string' })]),
    ]);

    expect(collected).toEqual({
      'review_branches.0': ['each value must be a string'],
    });
  });

  it('returns an empty object when nothing failed', () => {
    expect(collectValidationErrors([])).toEqual({});
  });
});

describe('laravelValidationException', () => {
  it('answers 422, not Nest default 400', () => {
    const exception = laravelValidationException([error('name', { isString: 'name must be a string' })]);

    expect(exception.getStatus()).toBe(422);
  });

  it('uses the first message as the top-level message, as Laravel does', () => {
    const exception = laravelValidationException([
      error('name', { isString: 'name must be a string' }),
      error('email', { isEmail: 'email must be an email' }),
    ]);

    expect(exception.getResponse()).toEqual({
      message: 'name must be a string',
      errors: {
        name: ['name must be a string'],
        email: ['email must be an email'],
      },
    });
  });

  it('falls back to Laravel wording when there is no message at all', () => {
    expect(laravelValidationException([]).getResponse()).toEqual({
      message: 'The given data was invalid.',
      errors: {},
    });
  });
});
