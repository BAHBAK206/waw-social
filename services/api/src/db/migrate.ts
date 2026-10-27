import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Applies extensions and SQL migrations. Safe to run repeatedly. */
export async function runMigrations(url: string, migrationsFolder = path.resolve(here, '../../drizzle')): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const url = process.env.DATABASE_URL ?? 'postgres://qubedu:qubedu@localhost:5432/qubedu';
  runMigrations(url, process.env.MIGRATIONS_DIR)
    .then(() => {
      console.info('migrations applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
