import { LIMITS } from '@qubedu/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, ImagePlus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { UploadButton } from '@/components/ui/Upload';
import { api, fileUrl } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { celebrate, toast, toastError } from '@/lib/ui';

const DURATIONS = [
  { key: 'h1', hours: 1 },
  { key: 'd1', hours: 24 },
  { key: 'd3', hours: 72 },
  { key: 'w1', hours: 168 },
  { key: 'none', hours: 0 },
] as const;

/** Finds the hashtag being typed at the caret, if any. */
function activeTag(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const m = /(?:^|[\s(])#([\p{L}\p{N}_]{0,40})$/u.exec(before);
  return m ? { start: caret - m[1]!.length - 1, query: m[1]! } : null;
}

export function Composer({ groupId, onPosted }: { groupId?: string; onPosted?: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const uploadsOn = useSession((s) => s.config?.uploads.enabled ?? true);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [poll, setPoll] = useState<{ options: string[]; multiple: boolean; duration: (typeof DURATIONS)[number]['key'] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<{ tag: string; count: number }[]>([]);
  const [tagCtx, setTagCtx] = useState<{ start: number; query: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!tagCtx || tagCtx.query.length < 1) {
      setTagSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api.explore
        .suggestTags(tagCtx.query, ctrl.signal)
        .then((r) => setTagSuggestions(r.items))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [tagCtx]);

  if (!me) return null;
  const validPoll = !poll || poll.options.filter((o) => o.trim()).length >= LIMITS.pollOptions.min;
  const canPost = (text.trim() || image || poll) && validPoll && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.posts.create({
        text: text.trim(),
        imageUrl: image,
        groupId: groupId ?? null,
        poll: poll
          ? {
              options: poll.options.map((o) => o.trim()).filter(Boolean),
              multiple: poll.multiple,
              durationHours: DURATIONS.find((d) => d.key === poll.duration)?.hours || undefined,
            }
          : undefined,
      });
      celebrate({ newAchievements: res.newAchievements });
      toast(tr.t('feed.posted'));
      setText('');
      setImage(null);
      setPoll(null);
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['group'] });
      onPosted?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex gap-3">
        <Avatar name={me.displayName} url={me.avatarUrl} />
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={area}
            className="input min-h-20 resize-none border-0 bg-transparent px-0 py-2 text-lg focus:shadow-none"
            placeholder={tr.t('feed.composer')}
            value={text}
            maxLength={LIMITS.postText}
            onChange={(e) => {
              setText(e.target.value);
              setTagCtx(activeTag(e.target.value, e.target.selectionStart));
            }}
            onKeyUp={(e) => setTagCtx(activeTag(e.currentTarget.value, e.currentTarget.selectionStart))}
            aria-label={tr.t('feed.composer')}
            dir="auto"
          />
          {tagSuggestions.length > 0 && tagCtx && (
            <ul className="card absolute start-0 z-20 mt-1 max-h-48 w-64 overflow-auto bg-[var(--card-solid)] py-1" role="listbox">
              {tagSuggestions.map((t) => (
                <li key={t.tag}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex min-h-10 w-full items-center justify-between px-3 text-start hover:bg-bg-3"
                    onClick={() => {
                      const caret = area.current?.selectionStart ?? text.length;
                      const next = `${text.slice(0, tagCtx.start)}#${t.tag} ${text.slice(caret)}`;
                      setText(next);
                      setTagSuggestions([]);
                      setTagCtx(null);
                      area.current?.focus();
                    }}
                  >
                    <span className="font-bold">#{t.tag}</span>
                    <span className="muted text-xs">{tr.t('explore.uses', { count: t.count })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {image && (
            <div className="relative mt-2 inline-block">
              <img src={fileUrl(image)} alt="" className="max-h-60 rounded-[var(--radius-control)]" />
              <button
                type="button"
                className="icon-btn icon-btn-sm absolute end-2 top-2 bg-black/60 text-white hover:bg-black/80"
                aria-label={tr.t('common.remove')}
                onClick={() => setImage(null)}
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          {poll && (
            <fieldset className="mt-3 space-y-2 rounded-[var(--radius-control)] border border-line p-3">
              <legend className="px-1 text-sm font-bold">{tr.t('poll.create')}</legend>
              {poll.options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input"
                    value={o}
                    maxLength={100}
                    placeholder={tr.t('poll.option', { n: i + 1 })}
                    aria-label={tr.t('poll.option', { n: i + 1 })}
                    onChange={(e) => setPoll({ ...poll, options: poll.options.map((x, k) => (k === i ? e.target.value : x)) })}
                  />
                  {poll.options.length > LIMITS.pollOptions.min && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={tr.t('common.remove')}
                      onClick={() => setPoll({ ...poll, options: poll.options.filter((_, k) => k !== i) })}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {poll.options.length < LIMITS.pollOptions.max && (
                <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setPoll({ ...poll, options: [...poll.options, ''] })}>
                  {tr.t('poll.addOption')}
                </Button>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={poll.multiple}
                    onChange={(e) => setPoll({ ...poll, multiple: e.target.checked })}
                  />
                  {tr.t('poll.multiple')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  {tr.t('poll.length')}
                  <select
                    className="input h-9 min-h-0 w-auto py-0"
                    value={poll.duration}
                    onChange={(e) => setPoll({ ...poll, duration: e.target.value as typeof poll.duration })}
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {tr.t(`poll.lengths.${d.key}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setPoll(null)}>
                  {tr.t('poll.remove')}
                </Button>
              </div>
              {!validPoll && <p className="text-sm text-err">{tr.t('poll.needTwo')}</p>}
            </fieldset>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-2">
        {uploadsOn && (
          <UploadButton variant="ghost" size="sm" purpose="post" imageOnly icon={<ImagePlus className="size-4" />} onUploaded={(r) => setImage(r.url)}>
            {tr.t('feed.addPhoto')}
          </UploadButton>
        )}
        {!poll && !image && (
          <Button
            variant="ghost"
            size="sm"
            icon={<BarChart3 className="size-4" />}
            onClick={() => setPoll({ options: ['', ''], multiple: false, duration: 'd1' })}
          >
            {tr.t('feed.addPoll')}
          </Button>
        )}
        <span className="muted ms-auto me-2 text-xs tabular-nums">
          {text.length > LIMITS.postText * 0.8 ? tr.t('common.characters', { count: text.length, max: LIMITS.postText }) : ''}
        </span>
        <Button size="sm" disabled={!canPost} loading={busy} onClick={() => void submit()}>
          {tr.t('feed.post')}
        </Button>
      </div>
    </div>
  );
}
