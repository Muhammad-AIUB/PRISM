import { types } from 'pg';

/**
 * Laravel's `$table->timestamps()` creates `timestamp WITHOUT time zone`
 * columns and writes UTC into them. node-postgres would otherwise parse those
 * strings in the server's LOCAL zone, silently shifting every `created_at` we
 * hand back to the MCP client. Parse them as UTC explicitly.
 *
 * Must be imported before the TypeORM DataSource connects.
 */
export function registerPgTypeParsers(): void {
  const TIMESTAMP_WITHOUT_TIMEZONE = 1114;

  types.setTypeParser(TIMESTAMP_WITHOUT_TIMEZONE, (value: string) =>
    new Date(`${value.replace(' ', 'T')}Z`),
  );
}
