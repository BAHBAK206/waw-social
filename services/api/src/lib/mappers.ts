import type { UserSummary, VerificationBadge } from '@qubedu/shared';
import { users } from '../db/schema';
import type { Kv } from './kv';

export const ms = (d: Date | null | undefined): number | null => (d ? d.getTime() : null);
export const msOr0 = (d: Date | null | undefined): number => (d ? d.getTime() : 0);

export const summaryColumns = {
  id: users.id,
  displayName: users.displayName,
  username: users.username,
  avatarUrl: users.avatarUrl,
  accountType: users.accountType,
  level: users.level,
  xp: users.xp,
  badge: users.badge,
};

export type SummaryRow = {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  accountType: 'student' | 'teacher' | 'parent';
  level: number;
  xp: number;
  badge: Record<string, unknown> | null;
};

export function toSummary(row: SummaryRow): UserSummary {
  const badge = row.badge && (row.badge as { enabled?: boolean }).enabled ? (row.badge as unknown as VerificationBadge) : null;
  return {
    id: row.id,
    displayName: row.displayName,
    username: row.username,
    avatarUrl: row.avatarUrl,
    accountType: row.accountType,
    level: row.level,
    xp: row.xp,
    badge,
  };
}

export const onlineKey = (uid: string) => `online:${uid}`;

export async function withOnline<T extends UserSummary>(kv: Kv, list: T[]): Promise<T[]> {
  if (!list.length) return list;
  const flags = await kv.existsMany(list.map((u) => onlineKey(u.id)));
  return list.map((u, i) => ({ ...u, online: flags[i] ?? false }));
}

/** Prefixes nested-select aliases (drizzle returns plain objects). */
export function pickSummary(prefix: string, row: Record<string, unknown>): SummaryRow {
  return {
    id: row[`${prefix}Id`] as string,
    displayName: row[`${prefix}DisplayName`] as string,
    username: (row[`${prefix}Username`] as string | null) ?? null,
    avatarUrl: (row[`${prefix}AvatarUrl`] as string | null) ?? null,
    accountType: row[`${prefix}AccountType`] as 'student' | 'teacher' | 'parent',
    level: row[`${prefix}Level`] as number,
    xp: row[`${prefix}Xp`] as number,
    badge: (row[`${prefix}Badge`] as Record<string, unknown> | null) ?? null,
  };
}
