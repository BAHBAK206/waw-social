import { runMigrations } from './migrate';

const url = process.env.DATABASE_URL ?? 'postgres://qubedu:qubedu@localhost:5432/qubedu';
try {
  await runMigrations(url, process.env.MIGRATIONS_DIR || undefined);
  console.info('migrations applied');
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
