import { GUIDES, isLocale } from '@qubedu/i18n';
import { FEATURES, GUIDE_LIST, type AccountType } from '@qubedu/shared';

export interface AiGuide {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tips: string[];
  note: string | null;
  link: string | null;
  guide: string;
}

/** The help guides in the reader's language, shaped for the local assistant (with the note for their account type). */
export function guideKnowledge(language: string, accountType: AccountType | null): AiGuide[] {
  const book = GUIDES[isLocale(language) ? language : 'ar'];
  return GUIDE_LIST.map((g) => {
    const text = book[g.id];
    const f = FEATURES.find((x) => x.id === g.feature);
    const route = f && 'route' in f && !f.route.includes(':') ? f.route : null;
    return {
      id: g.id,
      title: text.title,
      summary: text.summary,
      steps: text.steps,
      tips: text.tips ?? [],
      note: accountType && text.roles ? text.roles[accountType] : null,
      link: route,
      guide: `/help/${g.id}`,
    };
  });
}
