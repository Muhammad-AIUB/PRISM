import type { ValueTransformer } from 'typeorm';

/**
 * Postgres `bigint` arrives from node-postgres as a *string* (it can exceed
 * Number.MAX_SAFE_INTEGER). Laravel serialised these ids as JSON numbers, so
 * returning "12" instead of 12 would break the MCP client's response shape.
 * PRism ids are far below 2^53, so narrowing to Number is safe here.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null || value === undefined ? null : Number(value),
};
