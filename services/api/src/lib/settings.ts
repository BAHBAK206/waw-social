import { eq } from 'drizzle-orm';
import { normalizeFeatureControls, type FeatureControlMap } from '@qubedu/shared';
import type { Db } from '../db/client';
import { siteSettings } from '../db/schema';

export interface SiteSettings {
  features: FeatureControlMap;
  maintenance: { enabled: boolean; message: string };
  registrationOpen: boolean;
  contact: Record<string, string>;
  ai: { enabled: boolean; dailyQuota: number };
  uploads: { enabled: boolean };
  /** Automatic text filter and report handling. */
  moderation: { enabled: boolean; mask: string[]; block: string[]; autoHideReports: number };
}

export const DEFAULT_SETTINGS = (aiQuota: number): SiteSettings => ({
  features: {},
  maintenance: { enabled: false, message: '' },
  registrationOpen: true,
  contact: { email: '', phone: '', whatsapp: '', address: '', facebook: '', instagram: '', telegram: '' },
  ai: { enabled: true, dailyQuota: aiQuota },
  uploads: { enabled: true },
  moderation: { enabled: true, mask: [], block: [], autoHideReports: 3 },
});

let cache: { value: SiteSettings; at: number } | null = null;
const TTL_MS = 5000;

export function invalidateSettings() {
  cache = null;
}

export async function getSettings(db: Db, aiQuota: number): Promise<SiteSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db.select().from(siteSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const d = DEFAULT_SETTINGS(aiQuota);
  const obj = <T extends object>(key: string, fallback: T): T => {
    const v = map.get(key);
    return v && typeof v === 'object' && !Array.isArray(v) ? ({ ...fallback, ...(v as object) } as T) : fallback;
  };
  const value: SiteSettings = {
    features: normalizeFeatureControls(map.get('features')),
    maintenance: obj('maintenance', d.maintenance),
    registrationOpen: typeof map.get('registrationOpen') === 'boolean' ? (map.get('registrationOpen') as boolean) : true,
    contact: obj('contact', d.contact),
    ai: obj('ai', d.ai),
    uploads: obj('uploads', d.uploads),
    moderation: obj('moderation', d.moderation),
  };
  cache = { value, at: Date.now() };
  return value;
}

export async function putSetting(db: Db, key: string, value: unknown, actorId: string) {
  await db
    .insert(siteSettings)
    .values({ key, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actorId, updatedAt: new Date() } });
  invalidateSettings();
}

export async function getRawSetting(db: Db, key: string): Promise<unknown> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
  return row?.value;
}
