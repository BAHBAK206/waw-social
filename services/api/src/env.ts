import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().default('http://localhost:8787'),
  REALTIME_PUBLIC_URL: z.string().default('ws://localhost:8788/ws'),
  /** Used to push events to the hub over HTTP when Redis is not configured (single-node dev). */
  REALTIME_INTERNAL_URL: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8081,http://localhost:19006'),
  DATABASE_URL: z.string().default('postgres://qubedu:qubedu@localhost:5432/qubedu'),
  DATABASE_POOL: z.coerce.number().int().default(10),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret-change-me'),
  INTERNAL_TOKEN: z.string().min(16).default('dev-internal-token-change-me'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  ROOT_ADMIN_EMAIL: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./.local/storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  /** Where server errors, failed backups and video processing problems are announced (Slack/Discord/Telegram webhook). */
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  /** Video processing into 360p/720p/1080p streams (needs ffmpeg). */
  TRANSCODE_ENABLED: bool.default(true),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  /** CDN in front of public files (e.g. https://cdn.example.com). Public file links use it instead of the API address. */
  PUBLIC_FILES_URL: z.string().optional(),
  /** Web Push (browser notifications). Generated and stored automatically when not set. */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  /** Expo's push service for the mobile app. */
  EXPO_PUSH_URL: z.string().default('https://exp.host/--/api/v2/push/send'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool,
  MAIL_FROM: z.string().default('Qubedu <no-reply@qubedu.local>'),
  AI_SERVICE_URL: z.string().default('http://localhost:8790'),
  AI_DAILY_QUOTA: z.coerce.number().int().default(60),
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  REQUIRE_EMAIL_VERIFICATION: bool,
  /** Development/e2e only: ignored when NODE_ENV=production. */
  RATE_LIMIT_DISABLED: bool,
  TRUST_PROXY: bool,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.JWT_SECRET.startsWith('dev-only')) throw new Error('JWT_SECRET must be set in production');
    if (env.INTERNAL_TOKEN.startsWith('dev-internal')) throw new Error('INTERNAL_TOKEN must be set in production');
  }
  return env;
}
