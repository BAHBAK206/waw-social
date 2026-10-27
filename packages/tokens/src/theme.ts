import type { DesignName, SkinName, TextSize } from '@qubedu/shared';
import { mix, over, withAlpha } from './color';
import { DESIGN_TOKENS, SKIN_TOKENS, STATUS_TOKENS, TEXT_SCALE, type StatusTokens, type SurfaceTokens } from './palette';

export type ResolvedMode = 'light' | 'dark';

export interface ResolvedTheme extends SurfaceTokens, StatusTokens {
  mode: ResolvedMode;
  design: DesignName;
  skin: SkinName;
  primary: string;
  primary2: string;
  primary3: string;
  onPrimary: string;
  /** Brand color safe as text/icons on page and card surfaces. */
  primaryInk: string;
  primarySoft: string;
  gradient: [string, string];
  gradientDark: [string, string];
  overlay: string;
  shadow: string;
  radiusCard: number;
  radiusControl: number;
  glass: boolean;
  textScale: number;
  /** Opaque card color (glass composited over bg) for contrast checks / RN fallbacks. */
  cardSolid: string;
}

export function resolveTheme(design: DesignName, skin: SkinName, mode: ResolvedMode, textSize: TextSize = 'md'): ResolvedTheme {
  const d = DESIGN_TOKENS[design] ?? DESIGN_TOKENS.classic;
  const s = SKIN_TOKENS[skin] ?? SKIN_TOKENS.violet;
  const surface = d[mode];
  const status = STATUS_TOKENS[mode];
  const primary2 = mode === 'dark' && s.primary2Dark ? s.primary2Dark : s.primary2;
  const primaryInk = mode === 'dark' ? mix(primary2, '#ffffff', 0.5) : mix(s.primary, '#000000', 0.8);
  return {
    ...surface,
    ...status,
    mode,
    design,
    skin,
    primary: s.primary,
    primary2,
    primary3: s.primary3,
    onPrimary: s.onPrimary,
    primaryInk,
    primarySoft: withAlpha(s.primary, mode === 'dark' ? 0.16 : 0.1),
    gradient: s.gradient,
    gradientDark: s.gradientDark,
    overlay: mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(15,10,40,0.55)',
    shadow: mode === 'dark' ? 'rgba(0,0,0,0.35)' : `rgba(15,23,42,${d.shadowStrength})`,
    radiusCard: d.radiusCard,
    radiusControl: d.radiusControl,
    glass: d.glass,
    textScale: TEXT_SCALE[textSize],
    cardSolid: over(surface.card, surface.bg),
  };
}

/** CSS custom properties for one theme (used by the web app). */
export function themeVariables(t: ResolvedTheme): Record<string, string> {
  return {
    '--bg': t.bg,
    '--bg-2': t.bg2,
    '--bg-3': t.bg3,
    '--card': t.card,
    '--card-2': t.card2,
    '--card-solid': t.cardSolid,
    '--text': t.text,
    '--text-2': t.text2,
    '--text-3': t.text3,
    '--border': t.border,
    '--primary': t.primary,
    '--primary-2': t.primary2,
    '--primary-3': t.primary3,
    '--on-primary': t.onPrimary,
    '--primary-ink': t.primaryInk,
    '--primary-soft': t.primarySoft,
    '--grad-from': t.gradient[0],
    '--grad-to': t.gradient[1],
    '--grad-dark-from': t.gradientDark[0],
    '--grad-dark-to': t.gradientDark[1],
    '--ok': t.ok,
    '--warn': t.warn,
    '--err': t.err,
    '--info': t.info,
    '--gold': t.gold,
    '--ok-fill': t.okFill,
    '--warn-fill': t.warnFill,
    '--err-fill': t.errFill,
    '--info-fill': t.infoFill,
    '--overlay': t.overlay,
    '--shadow-color': t.shadow,
    '--radius-card': `${t.radiusCard}px`,
    '--radius-control': `${t.radiusControl}px`,
  };
}

/**
 * Full stylesheet: surfaces per [data-design][data-theme], accents per [data-skin][data-theme].
 * Selectors are attribute-based so switching appearance never reloads the page.
 */
export function buildThemeCss(): string {
  const designs = Object.keys(DESIGN_TOKENS) as DesignName[];
  const skins = Object.keys(SKIN_TOKENS) as SkinName[];
  const modes: ResolvedMode[] = ['light', 'dark'];
  const accentKeys = new Set([
    '--primary', '--primary-2', '--primary-3', '--on-primary', '--primary-ink', '--primary-soft',
    '--grad-from', '--grad-to', '--grad-dark-from', '--grad-dark-to',
  ]);
  const lines: string[] = [];
  const block = (selector: string, vars: Record<string, string>) =>
    `${selector}{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
  for (const mode of modes) {
    for (const design of designs) {
      const t = resolveTheme(design, 'violet', mode);
      const vars = Object.fromEntries(Object.entries(themeVariables(t)).filter(([k]) => !accentKeys.has(k)));
      const sel = design === 'classic' && mode === 'light'
        ? `:root,[data-design="classic"][data-theme="light"]`
        : `[data-design="${design}"][data-theme="${mode}"]`;
      lines.push(block(sel, { ...vars, 'color-scheme': mode }));
    }
    for (const skin of skins) {
      const t = resolveTheme('classic', skin, mode);
      const vars = Object.fromEntries(Object.entries(themeVariables(t)).filter(([k]) => accentKeys.has(k)));
      const sel = skin === 'violet' && mode === 'light' ? `:root,[data-skin="violet"][data-theme="light"]` : `[data-skin="${skin}"][data-theme="${mode}"]`;
      lines.push(block(sel, vars));
    }
  }
  return lines.join('\n');
}

