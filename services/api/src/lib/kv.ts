import { Redis } from 'ioredis';

/** Small key-value + pub/sub abstraction: Redis in production, in-memory fallback for single-node dev. */
export interface Kv {
  /** Increments a counter, setting TTL on first increment. Returns the new value and remaining TTL. */
  incr(key: string, ttlSec: number): Promise<{ count: number; ttl: number }>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  existsMany(keys: string[]): Promise<boolean[]>;
  publish(channel: string, message: string): Promise<void>;
  close(): Promise<void>;
  readonly kind: 'redis' | 'memory';
}

export class MemoryKv implements Kv {
  readonly kind = 'memory' as const;
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  readonly published: { channel: string; message: string }[] = [];

  private alive(key: string) {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e;
  }
  async incr(key: string, ttlSec: number) {
    const e = this.alive(key);
    const count = (e ? Number(e.value) : 0) + 1;
    const expiresAt = e?.expiresAt ?? Date.now() + ttlSec * 1000;
    this.store.set(key, { value: String(count), expiresAt });
    return { count, ttl: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)) };
  }
  async get(key: string) {
    return this.alive(key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSec?: number) {
    this.store.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
  }
  async del(key: string) {
    this.store.delete(key);
  }
  async existsMany(keys: string[]) {
    return keys.map((k) => this.alive(k) !== null);
  }
  async publish(channel: string, message: string) {
    this.published.push({ channel, message });
    if (this.published.length > 1000) this.published.shift();
  }
  async close() {}
}

export class RedisKv implements Kv {
  readonly kind = 'redis' as const;
  constructor(private readonly redis: Redis) {}
  async incr(key: string, ttlSec: number) {
    const [[, count], [, ttl]] = (await this.redis.multi().incr(key).ttl(key).exec()) as [[null, number], [null, number]];
    if (ttl < 0) await this.redis.expire(key, ttlSec);
    return { count, ttl: ttl < 0 ? ttlSec : ttl };
  }
  async get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlSec?: number) {
    if (ttlSec) await this.redis.set(key, value, 'EX', ttlSec);
    else await this.redis.set(key, value);
  }
  async del(key: string) {
    await this.redis.del(key);
  }
  async existsMany(keys: string[]) {
    if (!keys.length) return [];
    const pipe = this.redis.pipeline();
    for (const k of keys) pipe.exists(k);
    const res = (await pipe.exec()) ?? [];
    return res.map(([, v]) => v === 1);
  }
  async publish(channel: string, message: string) {
    await this.redis.publish(channel, message);
  }
  async close() {
    await this.redis.quit();
  }
}

export async function createKv(url?: string): Promise<Kv> {
  if (!url) return new MemoryKv();
  const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true, enableOfflineQueue: false });
  await redis.connect();
  return new RedisKv(redis);
}
