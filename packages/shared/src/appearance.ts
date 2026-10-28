export type ThemeMode = 'light' | 'dark' | 'system';
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

export type DesignName = 'classic' | 'light' | 'black' | 'burgundy' | 'glass' | 'natural';
export const DESIGNS: readonly DesignName[] = ['classic', 'light', 'black', 'burgundy', 'glass', 'natural'];

export type SkinName = 'violet' | 'noon' | 'neon' | 'ocean' | 'black' | 'white' | 'burgundy' | 'green';
export const SKINS: readonly SkinName[] = ['violet', 'noon', 'neon', 'ocean', 'black', 'white', 'burgundy', 'green'];

export type Language = 'ar' | 'en' | 'fr' | 'es';
export const LANGUAGES: readonly Language[] = ['ar', 'en', 'fr', 'es'];

export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export const TEXT_SIZES: readonly TextSize[] = ['sm', 'md', 'lg', 'xl'];

/** `dyslexic`: OpenDyslexic for Latin letters plus wider letter, word and line spacing in every language. */
export type ReadingFont = 'default' | 'dyslexic';
export const READING_FONTS: readonly ReadingFont[] = ['default', 'dyslexic'];

export interface Appearance {
  theme: ThemeMode;
  design: DesignName;
  skin: SkinName;
  language: Language;
  textSize: TextSize;
  reduceMotion: boolean;
  highContrast: boolean;
  readingFont: ReadingFont;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'light',
  design: 'classic',
  skin: 'violet',
  language: 'ar',
  textSize: 'md',
  reduceMotion: false,
  highContrast: false,
  readingFont: 'default',
};
