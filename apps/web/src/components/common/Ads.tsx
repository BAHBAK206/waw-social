import type { AdDto } from '@qubedu/shared';
import { Megaphone } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { api, fileUrl } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

const seen = new Set<string>();

/** Sponsored cards configured by admins; impressions are batched and clicks are counted server-side. */
export function AdsStrip({ placement }: { placement: 'home' | 'quiz' }) {
  const tr = useT();
  const ads = useSession((s) => s.config?.ads ?? []).filter((a: AdDto) => a.active && (a.placement === placement || a.placement === 'both'));
  const ref = useRef<HTMLDivElement>(null);
  const ids = ads.map((a) => a.id).join(',');
  useEffect(() => {
    const fresh = ads.map((a) => a.id).filter((id) => !seen.has(id));
    if (!fresh.length || !ref.current) return;
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting) {
        fresh.forEach((id) => seen.add(id));
        void api.adImpressions(fresh).catch(() => undefined);
        io.disconnect();
      }
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ads.length) return null;
  return (
    <div ref={ref} className="mb-5 grid gap-3 sm:grid-cols-2" aria-label={tr.t('home.sponsored')}>
      {ads.slice(0, 2).map((ad) => {
        const external = !!ad.link && /^https?:/.test(ad.link);
        const body = (
          <>
            {ad.imageUrl ? (
              <img src={fileUrl(ad.imageUrl)} alt="" loading="lazy" className="size-16 rounded-[var(--radius-control)] object-cover" />
            ) : (
              <Megaphone className="size-8 shrink-0 text-ink" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              <span className="badge mb-1">{tr.t('home.sponsored')}</span>
              <span className="line-clamp-1 block font-black">{ad.title}</span>
              {ad.subtitle && <span className="muted line-clamp-1 block text-sm">{ad.subtitle}</span>}
            </span>
          </>
        );
        return ad.link ? (
          <a
            key={ad.id}
            href={ad.link}
            className="card flex items-center gap-3 p-3"
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer sponsored' : undefined}
            onClick={() => void api.adClick(ad.id).catch(() => undefined)}
          >
            {body}
          </a>
        ) : (
          <div key={ad.id} className="card flex items-center gap-3 p-3">
            {body}
          </div>
        );
      })}
    </div>
  );
}
