import type { Locale } from '../index';
import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import type { GuideBook } from './types';

export type { GuideBook, GuideText } from './types';

/** Feature guides in every language (help center, per-page help, and the local assistant's knowledge). */
export const GUIDES: Record<Locale, GuideBook> = { ar, en, fr, es };
