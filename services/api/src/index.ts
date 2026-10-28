import { serve } from '@hono/node-server';
import { createApp } from './app';
import { runMigrations } from './db/migrate';
import { createDeps } from './deps';
import { loadEnv } from './env';
import { startTranscodeWorker } from './lib/transcode';
import { startWeeklyReports } from './routes/family';

const env = loadEnv();
if (process.env.MIGRATE_ON_START !== 'false') await runMigrations(env.DATABASE_URL, process.env.MIGRATIONS_DIR || undefined);
const deps = await createDeps(env);
const app = createApp(deps);

const stopTranscode = env.TRANSCODE_ENABLED ? startTranscodeWorker(deps) : () => undefined;
const stopReports = startWeeklyReports(deps);

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  deps.log.info(`Qubedu API listening on http://${info.address}:${info.port}`);
});

const shutdown = async () => {
  deps.log.info('shutting down');
  stopTranscode();
  stopReports();
  server.close();
  await Promise.allSettled([deps.sql.end({ timeout: 5 }), deps.kv.close()]);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
