import pino from 'pino';
import { createDb } from './db/client';
import type { Env } from './env';
import { createAiClient } from './lib/ai';
import type { Deps } from './lib/context';
import { createKv } from './lib/kv';
import { createMailer } from './lib/mailer';
import { createRealtime } from './lib/realtime';
import { createStorage } from './lib/storage';

export async function createDeps(env: Env, overrides: Partial<Deps> = {}): Promise<Deps> {
  const log =
    overrides.log ??
    pino({
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
    });
  const { db, sql } = createDb(env.DATABASE_URL, env.DATABASE_POOL);
  let kv = overrides.kv;
  if (!kv) {
    try {
      kv = await createKv(env.REDIS_URL);
    } catch (err) {
      log.warn({ err }, 'redis unavailable, using in-memory store (single instance only)');
      kv = await createKv(undefined);
    }
  }
  return {
    env,
    db,
    sql,
    kv,
    log,
    storage: overrides.storage ?? createStorage(env),
    mailer: overrides.mailer ?? createMailer(env, log),
    realtime:
      overrides.realtime ??
      createRealtime(kv, (err) => log.warn({ err }, 'realtime publish failed'), {
        hubUrl: env.REALTIME_INTERNAL_URL,
        internalToken: env.INTERNAL_TOKEN,
      }),
    ai: overrides.ai ?? createAiClient(env.AI_SERVICE_URL, env.INTERNAL_TOKEN),
  };
}
