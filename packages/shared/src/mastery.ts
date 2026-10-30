export type MasteryLevel = 'needs_review' | 'developing' | 'proficient' | 'strong';

export interface TopicSample {
  pct: number;
  total: number;
  ts: number;
}

export interface TopicMastery {
  key: string;
  topic: string;
  courseId: string | null;
  mastery: number;
  confidence: 'low' | 'medium' | 'high';
  evidenceQuestions: number;
  attempts: number;
  latestTs: number;
  trend: 'improving' | 'stable' | 'declining';
  level: MasteryLevel;
}

export function masteryLevel(mastery: number): MasteryLevel {
  return mastery < 60 ? 'needs_review' : mastery < 75 ? 'developing' : mastery < 90 ? 'proficient' : 'strong';
}

export function topicKey(topic: string, courseId?: string | null): string {
  return `${courseId ?? '_'}::${topic.trim().toLowerCase().slice(0, 120)}`;
}

/** Recency-weighted mastery (45-day decay, floor 0.35) with sample-size weighting. */
export function computeMastery(key: string, topic: string, courseId: string | null, samples: TopicSample[], now = Date.now()): TopicMastery {
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  let weighted = 0;
  let weight = 0;
  for (const s of sorted) {
    const ageDays = s.ts ? Math.max(0, (now - s.ts) / 86_400_000) : 365;
    const w = Math.max(0.35, Math.exp(-ageDays / 45)) * Math.min(2, Math.max(1, s.total / 5));
    weighted += s.pct * w;
    weight += w;
  }
  const mastery = weight ? Math.round(weighted / weight) : 0;
  const evidenceQuestions = sorted.reduce((n, s) => n + s.total, 0);
  const attempts = sorted.length;
  const confidence = evidenceQuestions >= 12 && attempts >= 3 ? 'high' : evidenceQuestions >= 6 && attempts >= 2 ? 'medium' : 'low';
  const recent = sorted.slice(-2).map((s) => s.pct);
  const trend = recent.length < 2 || Math.abs(recent[1]! - recent[0]!) < 8 ? 'stable' : recent[1]! > recent[0]! ? 'improving' : 'declining';
  return {
    key,
    topic,
    courseId,
    mastery,
    confidence,
    evidenceQuestions,
    attempts,
    latestTs: sorted.at(-1)?.ts ?? 0,
    trend,
    level: masteryLevel(mastery),
  };
}
