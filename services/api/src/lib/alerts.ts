import { sql } from 'drizzle-orm';
import { clientErrors } from '../db/schema';
import type { Deps } from './context';
import { sha256 } from './crypto';

/**
 * Sends a short text to the administrators' chat (Slack, Discord, Telegram bot, Teams or any webhook that accepts
 * JSON with `text` / `content`). The same alert key is sent at most once per 15 minutes.
 */
export async function sendAlert(deps: Deps, key: string, text: string): Promise<boolean> {
  const url = deps.env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  const { count } = await deps.kv.incr(`alert:${sha256(key)}`, 15 * 60);
  if (count > 1) return false;
  try {
    const body = { text, content: text.slice(0, 1900) };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (err) {
    deps.log.warn({ err }, 'alert webhook failed');
    return false;
  }
}

/** Unhandled server errors land in the admin "Errors" list next to app errors, and alert the team the first time. */
export async function recordServerError(deps: Deps, err: unknown, ctx: { path: string; method: string; userId?: string | null }) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const frames = (e.stack ?? '').split('\n').slice(1, 4).join('\n');
    const message = `${e.name}: ${e.message}`.slice(0, 1000);
    const fingerprint = sha256(`server|${message}|${frames}`);
    const [row] = await deps.db
      .insert(clientErrors)
      .values({
        fingerprint,
        message,
        kind: 'server',
        url: `${ctx.method} ${ctx.path}`.slice(0, 2048),
        release: process.env.APP_RELEASE ?? null,
        sampleStack: (e.stack ?? '').slice(0, 8000),
        userId: ctx.userId ?? null,
      })
      .onConflictDoUpdate({
        target: clientErrors.fingerprint,
        set: { count: sql`${clientErrors.count} + 1`, lastSeenAt: new Date(), url: `${ctx.method} ${ctx.path}`.slice(0, 2048) },
      })
      .returning({ count: clientErrors.count });
    const n = row?.count ?? 1;
    // First occurrence, then again when it keeps happening (10, 100, 1000…).
    if (n === 1 || [10, 100, 1000, 10000].includes(n))
      await sendAlert(
        deps,
        `${fingerprint}:${n}`,
        `🚨 Qubedu server error (${n}×)\n${message}\n${ctx.method} ${ctx.path}\n${deps.env.APP_URL}/admin?tab=errors`,
      );
  } catch (inner) {
    deps.log.warn({ err: inner }, 'could not record server error');
  }
}
