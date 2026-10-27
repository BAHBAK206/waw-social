import { serve } from '@hono/node-server';
import { createApp } from './app';
import { runMigrations } from './db/migrate';
import { createDeps } from './deps';
import { loadEnv } from './env';

const env = loadEnv();
if (process.env.MIGRATE_ON_START !== 'false') await runMigrations(env.DATABASE_URL, process.env.MIGRATIONS_DIR || undefined);
const deps = await createDeps(env);
const app = createApp(deps);

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  deps.log.info(`Qubedu API listening on http://${info.address}:${info.port}`);
});

const shutdown = async () => {
  deps.log.info('shutting down');
  server.close();
  await Promise.allSettled([deps.sql.end({ timeout: 5 }), deps.kv.close()]);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
