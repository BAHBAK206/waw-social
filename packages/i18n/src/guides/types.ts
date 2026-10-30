import type { GuideId } from '@qubedu/shared';

export interface GuideText {
  title: string;
  /** One or two sentences: what the feature is for. */
  summary: string;
  /** How to use it, in order. */
  steps: string[];
  /** Detailed guides only. */
  tips?: string[];
  /** Detailed guides only: what differs for each account type. */
  roles?: { student: string; teacher: string; parent: string };
}

export type GuideBook = Record<GuideId, GuideText>;
