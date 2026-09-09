const DAY = 86_400_000;

/** Age since creation: 0 fresh, 1 yellowing (>7d), 2 cracked (>14d), 3 cobwebbed (>30d). */
export type StaleStage = 0 | 1 | 2 | 3;

export const STALE_THRESHOLDS_DAYS = [7, 14, 30] as const;

export function daysSince(ts: number, now = Date.now()): number {
  return Math.max(0, (now - ts) / DAY);
}

export function staleStage(createdAt: number, now = Date.now()): StaleStage {
  const d = daysSince(createdAt, now);
  if (d >= STALE_THRESHOLDS_DAYS[2]) return 3;
  if (d >= STALE_THRESHOLDS_DAYS[1]) return 2;
  if (d >= STALE_THRESHOLDS_DAYS[0]) return 1;
  return 0;
}

export const STALE_LABELS: Record<StaleStage, string> = {
  0: 'fresh',
  1: 'a week old',
  2: 'two weeks old',
  3: 'a month or more'
};

/** Age buckets for the "Age" view. */
export const AGE_GROUPS: { key: string; label: string; test: (days: number) => boolean }[] = [
  { key: 'today', label: 'Created today', test: (d) => d < 1 },
  { key: 'week', label: 'This week', test: (d) => d >= 1 && d < 7 },
  { key: 'fortnight', label: '1–2 weeks', test: (d) => d >= 7 && d < 14 },
  { key: 'month', label: '2–4 weeks', test: (d) => d >= 14 && d < 30 },
  { key: 'old', label: 'A month or more', test: (d) => d >= 30 }
];

export function ageGroupKey(createdAt: number, now = Date.now()): string {
  const d = daysSince(createdAt, now);
  return AGE_GROUPS.find((g) => g.test(d))?.key ?? 'old';
}
