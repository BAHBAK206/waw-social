import { resolveTheme, type ResolvedTheme } from '@qubedu/tokens';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useAppearance } from './appearance';

export type Theme = ResolvedTheme;

/** Resolved design × skin × mode (same tokens the web app uses), plus the system color scheme for "system". */
export function useTheme(): Theme {
  const a = useAppearance((s) => s.appearance);
  const scheme = useColorScheme();
  return useMemo(() => {
    const mode = a.theme === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : a.theme;
    return resolveTheme(a.design, a.skin, mode, a.textSize);
  }, [a.theme, a.design, a.skin, a.textSize, scheme]);
}

export const FONT = { regular: 'Tajawal_400Regular', medium: 'Tajawal_500Medium', bold: 'Tajawal_700Bold', black: 'Tajawal_800ExtraBold' } as const;
