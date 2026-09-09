import { describe, expect, it } from 'vitest';
import { bucketLoad, buildCapacityIndex, effectiveBucketId, effectivePoints, loadLevel } from '../src/lib/model/capacity';
import { newCard } from '../src/lib/model/seed';
import type { Bucket } from '../src/lib/model/types';

const today: Bucket = { id: 'today', name: 'Today', order: 0, budget: 8, kind: 'time' };
const week: Bucket = { id: 'week', name: 'Week', order: 1, budget: 30, kind: 'time' };

describe('effectivePoints', () => {
  it('uses own effort when set', () => {
    const c = newCard({ title: 'a', effort: 4, bucketId: 'today' });
    expect(effectivePoints(c, buildCapacityIndex([c]))).toBe(8);
  });

  it('falls back to the default when nothing is sized', () => {
    const c = newCard({ title: 'a', bucketId: 'today' });
    expect(effectivePoints(c, buildCapacityIndex([c], 3))).toBe(3);
  });

  it('sums open inheriting children when unsized', () => {
    const p = newCard({ title: 'p', bucketId: 'today' });
    const k1 = newCard({ title: 'k1', parentId: p.id, effort: 2 });
    const k2 = newCard({ title: 'k2', parentId: p.id, effort: 3 });
    const done = newCard({ title: 'done', parentId: p.id, effort: 5, doneAt: 1 });
    const elsewhere = newCard({ title: 'sched', parentId: p.id, effort: 5, bucketId: 'week' });
    const idx = buildCapacityIndex([p, k1, k2, done, elsewhere]);
    expect(effectivePoints(p, idx)).toBe(2 + 4);
  });
});

describe('bucketLoad', () => {
  it('counts explicit bucket members only, and children with their own bucket', () => {
    const p = newCard({ title: 'p', bucketId: 'today', effort: 3 });
    const k = newCard({ title: 'k', parentId: p.id, effort: 2, bucketId: 'week' });
    const inh = newCard({ title: 'inh', parentId: p.id, effort: 1 });
    const person = newCard({ title: 'Helen', kind: 'person', bucketId: 'today' });
    const cards = [p, k, inh, person];
    const idx = buildCapacityIndex(cards);
    const t = bucketLoad(today, cards, idx);
    expect(t.points).toBe(4);
    expect(t.ratio).toBe(0.5);
    expect(t.contributors.map((c) => c.card.id)).toEqual([p.id]);
    const w = bucketLoad(week, cards, idx);
    expect(w.points).toBe(2);
  });

  it('returns null ratio for unlimited buckets', () => {
    const b: Bucket = { ...today, budget: null };
    const c = newCard({ title: 'a', bucketId: 'today' });
    expect(bucketLoad(b, [c], buildCapacityIndex([c])).ratio).toBeNull();
  });
});

describe('effectiveBucketId', () => {
  it('walks up to the nearest ancestor with a bucket', () => {
    const g = newCard({ title: 'g', bucketId: 'soon' });
    const p = newCard({ title: 'p', parentId: g.id });
    const k = newCard({ title: 'k', parentId: p.id });
    const byId = new Map([g, p, k].map((c) => [c.id, c]));
    expect(effectiveBucketId(k, byId)).toBe('soon');
    expect(effectiveBucketId(g, byId)).toBe('soon');
  });
});

describe('loadLevel', () => {
  it('bands the ratio', () => {
    expect(loadLevel(null)).toBe('ok');
    expect(loadLevel(0.5)).toBe('ok');
    expect(loadLevel(0.8)).toBe('warn');
    expect(loadLevel(1.2)).toBe('over');
  });
});
