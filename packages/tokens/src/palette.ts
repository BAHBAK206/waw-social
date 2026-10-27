import type { DesignName, SkinName } from '@qubedu/shared';

export interface SkinTokens {
  primary: string;
  primary2: string;
  primary2Dark?: string;
  primary3: string;
  gradient: [string, string];
  gradientDark: [string, string];
  /** Readable text on top of `primary`. */
  onPrimary: string;
}

/** Accent palettes — original Qubedu values (contrast-safe gradients from R453). */
export const SKIN_TOKENS: Record<SkinName, SkinTokens> = {
  violet: { primary: '#6c5ce7', primary2: '#a29bfe', primary3: '#4834d4', gradient: ['#6c5ce7', '#4834d4'], gradientDark: ['#4834d4', '#6c5ce7'], onPrimary: '#ffffff' },
  noon: { primary: '#b45309', primary2: '#fcd34d', primary3: '#92400e', gradient: ['#92400e', '#b45309'], gradientDark: ['#92400e', '#b45309'], onPrimary: '#ffffff' },
  neon: { primary: '#6d28d9', primary2: '#ec4899', primary3: '#7c3aed', gradient: ['#5b21b6', '#7c3aed'], gradientDark: ['#5b21b6', '#7c3aed'], onPrimary: '#ffffff' },
  ocean: { primary: '#0369a1', primary2: '#22d3ee', primary3: '#075985', gradient: ['#075985', '#0369a1'], gradientDark: ['#075985', '#0369a1'], onPrimary: '#ffffff' },
  black: { primary: '#334155', primary2: '#94a3b8', primary3: '#1e293b', gradient: ['#1e293b', '#475569'], gradientDark: ['#0f172a', '#334155'], onPrimary: '#ffffff' },
  white: { primary: '#475569', primary2: '#94a3b8', primary3: '#334155', gradient: ['#475569', '#334155'], gradientDark: ['#334155', '#1e293b'], onPrimary: '#ffffff' },
  burgundy: { primary: '#800020', primary2: '#b44a62', primary2Dark: '#cf6f86', primary3: '#5b0017', gradient: ['#5b0017', '#9b2c45'], gradientDark: ['#3f0010', '#800020'], onPrimary: '#ffffff' },
  green: { primary: '#047857', primary2: '#6ee7b7', primary3: '#065f46', gradient: ['#065f46', '#047857'], gradientDark: ['#065f46', '#047857'], onPrimary: '#ffffff' },
};

export interface SurfaceTokens {
  bg: string;
  bg2: string;
  bg3: string;
  card: string;
  card2: string;
  text: string;
  text2: string;
  text3: string;
  border: string;
}

export interface DesignTokens {
  light: SurfaceTokens;
  dark: SurfaceTokens;
  radiusCard: number;
  radiusControl: number;
  /** Visual treatment flags used by both web and mobile. */
  glass: boolean;
  shadowStrength: number;
}

const classicDark: SurfaceTokens = {
  bg: '#0f1320', bg2: '#171c2b', bg3: '#1d2435', card: '#171c2b', card2: '#1e2638',
  text: '#f4f7fb', text2: '#c4ccda', text3: '#8e99ab', border: '#2b3549',
};

/** Six design presets: geometry + surfaces. Light/dark values are the original ones. */
export const DESIGN_TOKENS: Record<DesignName, DesignTokens> = {
  classic: {
    light: { bg: '#f0f2f5', bg2: '#f7f8fc', bg3: '#e9ecf3', card: '#ffffff', card2: '#f8f7ff', text: '#2d3436', text2: '#555f64', text3: '#5f6b73', border: '#e2e8ef' },
    dark: classicDark,
    radiusCard: 18, radiusControl: 12, glass: false, shadowStrength: 0.07,
  },
  light: {
    light: { bg: '#f5f7fb', bg2: '#eef2f7', bg3: '#e6ebf2', card: '#ffffff', card2: '#fbfcff', text: '#1f2937', text2: '#4b5563', text3: '#5f6b7a', border: '#e3e8ef' },
    dark: classicDark,
    radiusCard: 22, radiusControl: 14, glass: false, shadowStrength: 0.09,
  },
  black: {
    light: { bg: '#edf1f5', bg2: '#e5eaf0', bg3: '#dce3eb', card: '#fbfcfd', card2: '#f1f4f7', text: '#17202c', text2: '#4b5563', text3: '#5b6677', border: '#d8e0e8' },
    dark: { bg: '#11141a', bg2: '#191e26', bg3: '#212832', card: '#191e26', card2: '#222a34', text: '#f5f7fa', text2: '#c7ced8', text3: '#8e99a6', border: '#303a47' },
    radiusCard: 13, radiusControl: 10, glass: false, shadowStrength: 0.16,
  },
  burgundy: {
    light: { bg: '#fbf5f6', bg2: '#f7eaed', bg3: '#f0dfe3', card: '#fffafb', card2: '#fff2f5', text: '#35141d', text2: '#68424d', text3: '#7d5a65', border: '#ead3d9' },
    dark: { bg: '#1b1015', bg2: '#25151c', bg3: '#301a23', card: '#25151c', card2: '#301a23', text: '#fff2f5', text2: '#d9b9c2', text3: '#ae8995', border: '#51303b' },
    radiusCard: 20, radiusControl: 12, glass: false, shadowStrength: 0.1,
  },
  glass: {
    light: { bg: '#eef2ff', bg2: 'rgba(255,255,255,0.58)', bg3: 'rgba(255,255,255,0.4)', card: 'rgba(255,255,255,0.62)', card2: 'rgba(255,255,255,0.45)', text: '#20233a', text2: '#4f546b', text3: '#5f6580', border: 'rgba(255,255,255,0.72)' },
    dark: { bg: '#0d1220', bg2: 'rgba(28,35,55,0.58)', bg3: 'rgba(35,43,66,0.5)', card: 'rgba(28,35,55,0.64)', card2: 'rgba(35,43,66,0.52)', text: '#f5f7ff', text2: '#c6cde0', text3: '#8e98b1', border: 'rgba(148,163,184,0.22)' },
    radiusCard: 22, radiusControl: 14, glass: true, shadowStrength: 0.13,
  },
  natural: {
    light: { bg: '#f2f7f4', bg2: '#e8f1eb', bg3: '#dfeae3', card: '#fbfefc', card2: '#f0f7f2', text: '#163127', text2: '#466457', text3: '#5a776b', border: '#d4e5da' },
    dark: { bg: '#0e1713', bg2: '#15221b', bg3: '#1c2c23', card: '#15221b', card2: '#1c2c23', text: '#eefbf4', text2: '#bdd6c8', text3: '#85a694', border: '#30473a' },
    radiusCard: 19, radiusControl: 13, glass: false, shadowStrength: 0.1,
  },
};

export interface StatusTokens {
  ok: string;
  warn: string;
  err: string;
  info: string;
  gold: string;
  okFill: string;
  warnFill: string;
  errFill: string;
  infoFill: string;
}

export const STATUS_TOKENS: { light: StatusTokens; dark: StatusTokens } = {
  light: { ok: '#00795f', warn: '#8a5a00', err: '#c62828', info: '#0b62b8', gold: '#b45309', okFill: '#00796b', warnFill: '#8a5a00', errFill: '#c62828', infoFill: '#0b62b8' },
  dark: { ok: '#00b894', warn: '#fdcb6e', err: '#ff7675', info: '#4da3ff', gold: '#f59e0b', okFill: '#00796b', warnFill: '#8a5a00', errFill: '#c62828', infoFill: '#0b62b8' },
};

export const BRAND = {
  name: 'Qubedu',
  themeColor: '#6c5ce7',
  palette: { accent: '#6c5ce7', violet: '#7c6cff', blue: '#4f8cff', cyan: '#22d3ee', background: '#10172b', surface: '#171b36' },
  fontFamily: 'Tajawal',
} as const;

export const SPACING = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const FONT_SIZES = { label: 12, body: 14, title: 16, headline: 22, display: 28 } as const;
export const TEXT_SCALE = { sm: 0.92, md: 1, lg: 1.1, xl: 1.22 } as const;
