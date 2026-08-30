import { UnprocessableEntityException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Turns class-validator's errors into Laravel's ValidationException response.
 *
 * Laravel answers a failed validation with 422 and:
 *   { "message": "<the first error message>",
 *     "errors": { "field": ["...", "..."] } }
 *
 * Nest's ValidationPipe defaults to 400 with { "message": ["..."] }, which the
 * frontend's form components cannot read — they key off `errors`. Keying off
 * ValidationError.property rather than parsing the message text also means the
 * field names are exact, including for custom messages.
 *
 * Nested errors use Laravel's dot notation ("review_branches.0"), so array
 * item failures land under a key the same way they do today.
 */
export function collectValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  const collected: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const messages = Object.values(error.constraints ?? {});

    if (messages.length > 0) {
      (collected[path] ??= []).push(...messages);
    }

    if (error.children && error.children.length > 0) {
      for (const [childPath, childMessages] of Object.entries(
        collectValidationErrors(error.children, path),
      )) {
        (collected[childPath] ??= []).push(...childMessages);
      }
    }
  }

  return collected;
}

export function laravelValidationException(
  errors: ValidationError[],
): UnprocessableEntityException {
  const collected = collectValidationErrors(errors);
  const first = Object.values(collected)[0]?.[0];

  return new UnprocessableEntityException({
    message: first ?? 'The given data was invalid.',
    errors: collected,
  });
}
