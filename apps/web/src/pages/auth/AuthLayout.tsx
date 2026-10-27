import { LANGUAGES, LIMITS } from '@qubedu/shared';
import { LOCALE_NAMES } from '@qubedu/i18n';
import { Eye, EyeOff, Languages } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Logo } from '@/components/layout/Logo';
import { useAppearance } from '@/lib/appearance';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const tr = useT();
  const language = useAppearance((s) => s.appearance.language);
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="surface-gradient relative hidden overflow-hidden lg:block">
        <img src="/brand/qubedu-auth-visual.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute inset-x-10 bottom-12 text-white">
          <p className="text-4xl leading-tight font-black">{tr.t('home.heroTitle')}</p>
          <p className="mt-3 max-w-md text-lg text-white/90">{tr.t('app.tagline')}</p>
        </div>
      </div>
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo />
          <label className="flex items-center gap-2 text-sm">
            <Languages className="size-4 text-fg-3" aria-hidden />
            <span className="sr-only">{tr.t('settings.appearance.language')}</span>
            <select className="input h-10 min-h-0 w-auto py-0" value={language} onChange={(e) => useAppearance.getState().update({ language: e.target.value as typeof language })}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-black">{title}</h1>
            {subtitle && <p className="muted mt-2">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= LIMITS.password.min) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (/^(.)\1+$/.test(pw) || /^(1234|password|qwerty)/i.test(pw)) score = 0;
  return Math.min(4, score);
}

export function PasswordInput({
  value,
  onChange,
  label,
  autoComplete,
  showStrength,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoComplete: string;
  showStrength?: boolean;
  error?: string;
}) {
  const tr = useT();
  const [show, setShow] = useState(false);
  const score = passwordScore(value);
  const colors = ['bg-err-fill', 'bg-err-fill', 'bg-warn-fill', 'bg-ok-fill', 'bg-ok-fill'];
  return (
    <div>
      <label htmlFor={`pw-${autoComplete}`} className="field-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={`pw-${autoComplete}`}
          className="input pe-12"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={autoComplete === 'new-password' ? LIMITS.password.min : undefined}
          maxLength={LIMITS.password.max}
          required
          aria-invalid={!!error || undefined}
        />
        <button
          type="button"
          className="icon-btn icon-btn-sm absolute end-1 top-1/2 -translate-y-1/2"
          aria-label={show ? tr.t('auth.hidePassword') : tr.t('auth.showPassword')}
          onClick={() => setShow((s) => !s)}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {showStrength && value && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < score ? colors[score] : 'bg-bg-3')} />
            ))}
          </div>
          <p className="muted mt-1 text-xs">{tr.dict.auth.strength[score]}</p>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-err">{error}</p>}
    </div>
  );
}
