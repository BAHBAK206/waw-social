import { resolveTheme, type ResolvedTheme } from '@qubedu/tokens';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useAppearance } from './appearance';

export const FONT = { regular: 'Tajawal_400Regular', medium: 'Tajawal_500Medium', bold: 'Tajawal_700Bold', black: 'Tajawal_800ExtraBold' } as const;
/** OpenDyslexic has Latin letters only: Arabic keeps Tajawal and gets the extra spacing. */
const DYSLEXIC_FONT = { regular: 'OpenDyslexic_Regular', medium: 'OpenDyslexic_Regular', bold: 'OpenDyslexic_Bold', black: 'OpenDyslexic_Bold' } as const;

export type Theme = ResolvedTheme & {
  fonts: Record<keyof typeof FONT, string>;
  /** Easier-reading mode: wider line and letter spacing. */
  dyslexic: boolean;
  /** Arabic text must not get letter spacing (it would break joined letters). */
  latin: boolean;
  highContrast: boolean;
  /** Border width for cards and controls (thicker in high contrast). */
  borderWidth: number;
};

/** Resolved design × skin × mode (same tokens the web app uses), plus the system color scheme for "system". */
export function useTheme(): Theme {
  const a = useAppearance((s) => s.appearance);
  const scheme = useColorScheme();
  return useMemo(() => {
    const mode = a.theme === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : a.theme;
    const dyslexic = a.readingFont === 'dyslexic';
    const latin = a.language !== 'ar';
    return {
      ...resolveTheme(a.design, a.skin, mode, a.textSize, a.highContrast),
      fonts: dyslexic && latin ? DYSLEXIC_FONT : FONT,
      dyslexic,
      latin,
      highContrast: a.highContrast,
      borderWidth: a.highContrast ? 2 : 1,
    };
  }, [a.theme, a.design, a.skin, a.textSize, a.highContrast, a.readingFont, a.language, scheme]);
}
