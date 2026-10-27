import type { AnnouncementDto } from '@qubedu/shared';
import { Info, Megaphone, TriangleAlert, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api, fileUrl } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, toastError } from '@/lib/ui';

const DISMISS_KEY = 'qubedu:dismissed-announcements';

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

const levelClass: Record<AnnouncementDto['level'], string> = {
  info: 'bg-info-fill',
  success: 'bg-ok-fill',
  warning: 'bg-warn-fill',
  critical: 'bg-err-fill',
};

export function AnnouncementsBar() {
  const tr = useT();
  const items = useSession((s) => s.config?.announcements ?? []);
  const [dismissed, setDismissed] = useState(readDismissed);
  const visible = items.filter((a) => !dismissed.includes(a.id) && (!a.expiresAt || a.expiresAt > Date.now()));
  if (!visible.length) return null;
  const a = visible[0]!;
  const dismiss = () => {
    const next = [...dismissed, a.id].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return (
    <div className={cx('app-chrome text-white', levelClass[a.level])} role="region" aria-label={tr.t('home.announcements')}>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        {a.imageUrl ? <img src={fileUrl(a.imageUrl)} alt="" className="size-8 rounded-lg object-cover" /> : <Megaphone className="size-5 shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-black">{a.title}</span> {a.text && <span className="opacity-95">— {a.text}</span>}
          {a.link && (
            <a href={a.link} className="ms-2 font-bold underline" target={a.link.startsWith('/') ? undefined : '_blank'} rel="noreferrer">
              {tr.t('common.open')}
            </a>
          )}
        </div>
        <button type="button" className="icon-btn icon-btn-sm text-white hover:bg-white/15 hover:text-white" aria-label={tr.t('common.close')} onClick={dismiss}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function VerifyEmailBar() {
  const tr = useT();
  const me = useSession((s) => s.me);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!me || me.emailVerified) return null;
  return (
    <div className="app-chrome border-b border-line bg-card-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <Info className="size-4 text-info" aria-hidden />
        <span className="flex-1 font-bold">{tr.t('auth.verifyBanner')}</span>
        <Button
          size="sm"
          variant="soft"
          loading={busy}
          disabled={sent}
          onClick={async () => {
            setBusy(true);
            try {
              await api.auth.resendVerification();
              setSent(true);
              toast(tr.t('auth.resent'));
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {sent ? tr.t('auth.resent') : tr.t('auth.resend')}
        </Button>
      </div>
    </div>
  );
}

export function OfflineBanner() {
  const tr = useT();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => {
      setOnline(true);
      toast(tr.t('common.backOnline'), 'info');
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [tr]);
  if (online) return null;
  return (
    <div role="status" className="bg-warn-fill text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5 text-sm font-bold">
        <WifiOff className="size-4" aria-hidden /> {tr.t('common.offline')}
      </div>
    </div>
  );
}

export function NoticeCard({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'err'; title?: string; children: React.ReactNode }) {
  const Icon = tone === 'info' ? Info : TriangleAlert;
  return (
    <div
      className={cx(
        'flex gap-3 rounded-[var(--radius-control)] border p-3 text-sm',
        tone === 'info' && 'border-[color-mix(in_srgb,var(--info)_30%,transparent)] bg-[color-mix(in_srgb,var(--info)_8%,transparent)]',
        tone === 'warn' && 'border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]',
        tone === 'err' && 'border-[color-mix(in_srgb,var(--err)_30%,transparent)] bg-[color-mix(in_srgb,var(--err)_8%,transparent)]',
      )}
    >
      <Icon className={cx('mt-0.5 size-4 shrink-0', tone === 'info' ? 'text-info' : tone === 'warn' ? 'text-warn' : 'text-err')} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        <div className="text-fg-2">{children}</div>
      </div>
    </div>
  );
}
