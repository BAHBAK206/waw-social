import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Sql = postgres.Sql;

export function createDb(url: string, max = 10): { db: Db; sql: Sql } {
  const sql = postgres(url, { max, idle_timeout: 30, connect_timeout: 10, onnotice: () => undefined });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export { schema };
