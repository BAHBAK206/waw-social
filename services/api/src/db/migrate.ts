import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Source layout keeps migrations at services/api/drizzle; the bundle ships them next to server.js. */
function defaultMigrationsFolder(): string {
  const bundled = path.resolve(here, 'drizzle');
  return existsSync(path.join(bundled, 'meta', '_journal.json')) ? bundled : path.resolve(here, '../../drizzle');
}

/** Applies extensions and SQL migrations. Safe to run repeatedly. */
export async function runMigrations(url: string, migrationsFolder = defaultMigrationsFolder()): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
