import type { PushSender } from './push';
import type { Logger } from 'pino';
import type { Db, Sql } from '../db/client';
import type { Env } from '../env';
import type { AiClient } from './ai';
import type { Kv } from './kv';
import type { Mailer } from './mailer';
import type { Realtime } from './realtime';
import type { Storage } from './storage';

export interface Deps {
  env: Env;
  db: Db;
  sql: Sql;
  kv: Kv;
  storage: Storage;
  mailer: Mailer;
  realtime: Realtime;
  ai: AiClient;
  log: Logger;
  /** Phone and browser notifications (absent = disabled). */
  push?: PushSender;
}

export interface AuthUser {
  id: string;
  role: 'user' | 'moderator' | 'admin' | 'root';
  permissions: string[];
  displayName: string;
  accountType: 'student' | 'teacher';
  timezone: string;
  sessionId: string;
  emailVerified: boolean;
}

export type AppEnv = {
  Variables: {
    deps: Deps;
    user: AuthUser | null;
    requestId: string;
  };
};
