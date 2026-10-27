import { ApiError } from '@qubedu/api-client';
import { createTranslator, type Locale, type Translator } from '@qubedu/i18n';
import { useAppearance } from './appearance';

const cache = new Map<Locale, Translator>();

export function translatorFor(locale: Locale): Translator {
  let t = cache.get(locale);
  if (!t) {
    t = createTranslator(locale);
    cache.set(locale, t);
  }
  return t;
}

/** Current translator; re-renders when the language changes. */
export function useT(): Translator {
  const locale = useAppearance((s) => s.appearance.language);
  return translatorFor(locale);
}

/** Non-hook access for stores and event handlers. */
export function currentT(): Translator {
  return translatorFor(useAppearance.getState().appearance.language);
}

/** Maps any thrown error to a localized, user-facing message. */
export function errorMessage(err: unknown, tr: Translator = currentT()): string {
  if (err instanceof ApiError) {
    if (err.isNetwork) return tr.t('errors.network');
    return tr.tDyn(`errors.${err.code}`, undefined, tr.t('common.errorGeneric'));
  }
  return tr.t('common.errorGeneric');
}
