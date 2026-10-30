import type { UserSummary, VerificationBadge } from '@qubedu/shared';
import { BadgeCheck, Crown, Diamond, GraduationCap, Ribbon, Shield } from 'lucide-react';
import { Link } from 'react-router';
import { fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';

const SIZES = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-24 text-3xl' } as const;
type Size = keyof typeof SIZES;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '');
}

function hue(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({
  name,
  url,
  size = 'md',
  online,
  className,
}: {
  name: string;
  url?: string | null;
  size?: Size;
  online?: boolean;
  className?: string;
}) {
  const tr = useT();
  return (
    <span className={cx('relative inline-flex shrink-0', className)}>
      {url ? (
        <img src={fileUrl(url)} alt="" loading="lazy" className={cx('rounded-full object-cover', SIZES[size])} />
      ) : (
        <span
          aria-hidden
          className={cx('grid place-items-center rounded-full font-bold text-white uppercase', SIZES[size])}
          style={{ background: `linear-gradient(135deg, hsl(${hue(name)} 62% 46%), hsl(${(hue(name) + 40) % 360} 62% 38%))` }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span className="absolute end-0 bottom-0 size-3 rounded-full bg-ok-fill ring-2 ring-[var(--card-solid)]" title={tr.t('people.online')}>
          <span className="sr-only">{tr.t('people.online')}</span>
        </span>
      )}
    </span>
  );
}

const SHAPES = { seal: BadgeCheck, shield: Shield, diamond: Diamond, ribbon: Ribbon, crown: Crown, pill: BadgeCheck } as const;

export function VerifiedBadge({ badge, className }: { badge: VerificationBadge | null | undefined; className?: string }) {
  if (!badge?.enabled) return null;
  const Icon = SHAPES[badge.shape] ?? BadgeCheck;
  if (badge.shape === 'pill' && badge.label) {
    return (
      <span className={cx('badge text-white', className)} style={{ background: badge.color }} title={badge.label}>
        {badge.icon} {badge.label}
      </span>
    );
  }
  return (
    <span className={cx('inline-flex shrink-0', className)} title={badge.label || undefined} aria-label={badge.label || 'verified'}>
      <Icon className="size-4" style={{ color: badge.color }} strokeWidth={2.4} />
    </span>
  );
}

/** Small cap shown next to the names of teachers the administrators verified. */
export function VerifiedTeacherMark({ show }: { show?: boolean }) {
  const tr = useT();
  if (!show) return null;
  return (
    <span className="inline-flex shrink-0 text-ok" title={tr.t('verification.badge')} aria-label={tr.t('verification.badge')} role="img">
      <GraduationCap className="size-4" strokeWidth={2.4} aria-hidden />
    </span>
  );
}

export function UserName({
  user,
  link = true,
  className,
}: {
  user: Pick<UserSummary, 'id' | 'displayName' | 'badge'> & { verifiedTeacher?: boolean };
  link?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      <span className="truncate">{user.displayName}</span>
      <VerifiedBadge badge={user.badge} />
      <VerifiedTeacherMark show={user.verifiedTeacher} />
    </>
  );
  return link ? (
    <Link to={`/u/${user.id}`} className={cx('inline-flex min-w-0 items-center gap-1 font-bold hover:underline', className)}>
      {inner}
    </Link>
  ) : (
    <span className={cx('inline-flex min-w-0 items-center gap-1 font-bold', className)}>{inner}</span>
  );
}

/** Avatar + name + optional subtitle, linking to the profile. */
export function UserChip({
  user,
  subtitle,
  size = 'md',
  link = true,
  className,
}: {
  user: UserSummary;
  subtitle?: React.ReactNode;
  size?: Size;
  link?: boolean;
  className?: string;
}) {
  const tr = useT();
  return (
    <div className={cx('flex min-w-0 items-center gap-3', className)}>
      {link ? (
        <Link to={`/u/${user.id}`} aria-hidden tabIndex={-1}>
          <Avatar name={user.displayName} url={user.avatarUrl} size={size} online={user.online} />
        </Link>
      ) : (
        <Avatar name={user.displayName} url={user.avatarUrl} size={size} online={user.online} />
      )}
      <div className="min-w-0">
        <UserName user={user} link={link} className="max-w-full" />
        <div className="muted truncate text-xs">{subtitle ?? (user.username ? `@${user.username}` : tr.t('common.levelN', { level: user.level }))}</div>
      </div>
    </div>
  );
}
