import { EFFORT_POINTS, type Bucket, type Card, type Id } from './types';

export interface CapacityIndex {
  byId: Map<Id, Card>;
  /** Open (not done) children per parent id. */
  openChildren: Map<Id, Card[]>;
  defaultPoints: number;
}

export function buildCapacityIndex(cards: Card[], defaultPoints = 2): CapacityIndex {
  const byId = new Map<Id, Card>();
  const openChildren = new Map<Id, Card[]>();
  for (const c of cards) byId.set(c.id, c);
  for (const c of cards) {
    if (c.parentId && c.doneAt == null) {
      const arr = openChildren.get(c.parentId) ?? [];
      arr.push(c);
      openChildren.set(c.parentId, arr);
    }
  }
  return { byId, openChildren, defaultPoints };
}

/** Own bucket, else the nearest ancestor's bucket. */
export function effectiveBucketId(card: Card, byId: Map<Id, Card>): Id | null {
  let cur: Card | undefined = card;
  const seen = new Set<Id>();
  while (cur) {
    if (cur.bucketId) return cur.bucketId;
    if (!cur.parentId || seen.has(cur.id)) return null;
    seen.add(cur.id);
    cur = byId.get(cur.parentId);
  }
  return null;
}

/**
 * Own effort if set; else the sum of open children that inherit this card's bucket;
 * else the default. Children with their own bucket are scheduled separately and
 * count in that bucket instead.
 */
export function effectivePoints(card: Card, idx: CapacityIndex, depth = 0): number {
  if (card.effort != null) return EFFORT_POINTS[card.effort];
  if (depth > 20) return idx.defaultPoints;
  const kids = (idx.openChildren.get(card.id) ?? []).filter((k) => k.bucketId == null && k.kind === 'todo');
  if (kids.length === 0) return idx.defaultPoints;
  return kids.reduce((sum, k) => sum + effectivePoints(k, idx, depth + 1), 0);
}

export interface BucketLoad {
  points: number;
  budget: number | null;
  /** 0..inf; 1 = exactly full. null when budget is null. */
  ratio: number | null;
  contributors: { card: Card; points: number }[];
}

export function bucketLoad(bucket: Bucket, cards: Card[], idx: CapacityIndex): BucketLoad {
  const contributors: { card: Card; points: number }[] = [];
  let points = 0;
  for (const c of cards) {
    if (c.doneAt != null || c.kind !== 'todo') continue;
    if (c.bucketId !== bucket.id) continue;
    const p = effectivePoints(c, idx);
    points += p;
    contributors.push({ card: c, points: p });
  }
  contributors.sort((a, b) => b.points - a.points);
  return {
    points,
    budget: bucket.budget,
    ratio: bucket.budget == null || bucket.budget <= 0 ? null : points / bucket.budget,
    contributors
  };
}

export type LoadLevel = 'ok' | 'warn' | 'over';

export function loadLevel(ratio: number | null): LoadLevel {
  if (ratio == null) return 'ok';
  if (ratio > 1) return 'over';
  if (ratio > 0.7) return 'warn';
  return 'ok';
}
