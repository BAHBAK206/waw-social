import { normalizeSearch, type SearchResultsDto } from '@qubedu/shared';
import type { TKey } from '@qubedu/i18n';
import { BookOpen, GraduationCap, Layers, ListChecks, MoonStar, Newspaper, Palette, Search, Share2, Timer, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { actionVisible, navItems } from '@/app/nav';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { useAppearance, resolvedMode } from '@/lib/appearance';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { toast, useUi } from '@/lib/ui';

interface Entry {
  id: string;
  group: 'pages' | 'actions' | 'results';
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export default function CommandPalette() {
  const tr = useT();
  const navigate = useNavigate();
  const me = useSession((s) => s.me);
  const controls = useSession((s) => s.config?.features ?? {});
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResultsDto | null>(null);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => useUi.getState().set({ paletteOpen: false });

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!me || q.trim().length < 2) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(q.trim(), ctrl.signal)
        .then(setResults)
        .catch(() => undefined);
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, me]);

  const entries = useMemo<Entry[]>(() => {
    const term = normalizeSearch(q);
    const go = (to: string) => () => {
      close();
      navigate(to);
    };
    const pages: Entry[] = navItems(controls)
      .filter((i) => !i.auth || me)
      .map((i) => ({
        id: `p-${i.id}`,
        group: 'pages' as const,
        label: tr.t(`nav.${i.id}` as TKey),
        hint: tr.t(`features.${i.id}` as TKey),
        icon: <i.icon className="size-4" />,
        run: go(i.route),
      }))
      .filter((e) => !term || normalizeSearch(`${e.label} ${e.hint}`).includes(term));
    const ui = useUi.getState();
    const dark = resolvedMode(useAppearance.getState().appearance) === 'dark';
    const candidates: (Omit<Entry, 'group'> | false)[] = [
      !!me &&
        actionVisible(controls, 'pomodoro') && {
          id: 'a-pomo',
          label: tr.t('features.pomodoro'),
          icon: <Timer className="size-4" />,
          run: () => ui.set({ paletteOpen: false, pomodoroOpen: true }),
        },
      !!me &&
        actionVisible(controls, 'flashcards') && {
          id: 'a-cards',
          label: tr.t('features.flashcards'),
          icon: <Layers className="size-4" />,
          run: () => ui.set({ paletteOpen: false, flashcards: {} }),
        },
      actionVisible(controls, 'theme') && {
        id: 'a-theme',
        label: `${tr.t('features.theme')} · ${tr.t(dark ? 'settings.appearance.themes.light' : 'settings.appearance.themes.dark')}`,
        icon: <Palette className="size-4" />,
        run: () => {
          useAppearance.getState().update({ theme: dark ? 'light' : 'dark' });
          close();
        },
      },
      actionVisible(controls, 'zen') && {
        id: 'a-zen',
        label: tr.t('features.zen'),
        icon: <MoonStar className="size-4" />,
        run: () => ui.set({ paletteOpen: false, zen: true }),
      },
      actionVisible(controls, 'share') && {
        id: 'a-share',
        label: tr.t('features.share'),
        icon: <Share2 className="size-4" />,
        run: () => {
          close();
          const url = location.origin;
          if (navigator.share) void navigator.share({ title: 'Qubedu', url }).catch(() => undefined);
          else void navigator.clipboard.writeText(url).then(() => toast(tr.t('common.copied')));
        },
      },
    ];
    const actions: Entry[] = candidates
      .filter((x): x is Omit<Entry, 'group'> => x !== false)
      .map((x) => ({ ...x, group: 'actions' as const }))
      .filter((e) => !term || normalizeSearch(e.label).includes(term));
    const res: Entry[] = [];
    if (results) {
      for (const u of results.users)
        res.push({
          id: `u-${u.id}`,
          group: 'results',
          label: u.displayName,
          hint: u.username ? `@${u.username}` : undefined,
          icon: <Avatar name={u.displayName} url={u.avatarUrl} size="xs" />,
          run: go(`/u/${u.id}`),
        });
      for (const g of results.groups)
        res.push({
          id: `g-${g.id}`,
          group: 'results',
          label: g.name,
          hint: tr.t('groups.members', { count: g.memberCount }),
          icon: <UsersRound className="size-4" />,
          run: go(`/groups/${g.id}`),
        });
      for (const z of results.quizzes)
        res.push({
          id: `q-${z.id}`,
          group: 'results',
          label: z.title,
          hint: tr.t('quiz.questions', { count: z.questionCount }),
          icon: <ListChecks className="size-4" />,
          run: go(`/quiz?open=${z.id}`),
        });
      for (const c of results.courses)
        res.push({
          id: `c-${c.id}`,
          group: 'results',
          label: c.title,
          hint: c.subject ?? undefined,
          icon: <GraduationCap className="size-4" />,
          run: go(`/school/${c.id}`),
        });
      for (const l of results.library)
        res.push({
          id: `l-${l.id}`,
          group: 'results',
          label: l.title,
          icon: <BookOpen className="size-4" />,
          run: go(`/library?q=${encodeURIComponent(l.title)}`),
        });
      for (const p of results.posts)
        res.push({
          id: `po-${p.id}`,
          group: 'results',
          label: p.text.slice(0, 80),
          hint: p.author.displayName,
          icon: <Newspaper className="size-4" />,
          run: go(`/post/${p.id}`),
        });
    }
    return [...res, ...pages.slice(0, term ? 8 : 12), ...actions];
  }, [q, results, controls, me, tr, navigate]);

  useEffect(() => {
    setIndex(0);
  }, [q, results]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(entries.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      entries[index]?.run();
    }
  };

  const groups: Entry['group'][] = ['results', 'pages', 'actions'];
  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center p-3 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label={tr.t('nav.search')}
      onKeyDown={onKey}
    >
      <div className="animate-fade absolute inset-0 bg-[var(--overlay)]" onClick={close} />
      <div className="card animate-pop relative w-full max-w-xl overflow-hidden bg-[var(--card-solid)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 text-fg-3" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr.t('palette.placeholder')}
            className="h-14 min-w-0 flex-1 bg-transparent outline-none"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={entries[index] ? `pe-${entries[index].id}` : undefined}
          />
          <kbd className="badge">Esc</kbd>
        </div>
        <div id="palette-list" role="listbox" className="scroll-thin max-h-[60vh] overflow-y-auto p-2">
          {!entries.length && <p className="muted px-3 py-6 text-center">{tr.t('palette.noResults')}</p>}
          {groups.map((g) => {
            const list = entries.filter((e) => e.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="mb-2">
                <p className="px-3 py-1 text-xs font-black text-fg-3 uppercase">{tr.t(`palette.${g}` as TKey)}</p>
                {list.map((e) => {
                  const i = entries.indexOf(e);
                  return (
                    <button
                      key={e.id}
                      id={`pe-${e.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === index}
                      onMouseEnter={() => setIndex(i)}
                      onClick={e.run}
                      className={cx(
                        'flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-start',
                        i === index ? 'bg-soft text-ink' : 'hover:bg-bg-3',
                      )}
                    >
                      <span className="grid size-7 shrink-0 place-items-center">{e.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{e.label}</span>
                        {e.hint && <span className="muted block truncate text-xs">{e.hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {me && q.trim().length >= 2 && !results && <p className="muted px-3 py-2 text-sm">{tr.t('common.loading')}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
