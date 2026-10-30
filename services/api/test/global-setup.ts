import postgres from 'postgres';
import { runMigrations } from '../src/db/migrate';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://qubedu:qubedu@localhost:5432/qubedu_test';
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  await sql.unsafe('drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;');
  await sql.end();
  await runMigrations(url);
}
