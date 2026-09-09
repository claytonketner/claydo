import { describe, expect, it } from 'vitest';
import { mergeDocs, migrateDoc, parseDocJson } from '../src/lib/persist/backup';
import { emptyDoc, newCard, seedDoc } from '../src/lib/model/seed';

describe('migrateDoc', () => {
  it('round-trips a seed doc', () => {
    const doc = seedDoc(1_800_000_000_000);
    const back = parseDocJson(JSON.stringify(doc));
    expect(back.cards.length).toBe(doc.cards.length);
    expect(back.buckets.map((b) => b.id)).toEqual(doc.buckets.map((b) => b.id));
  });

  it('fills defaults for sparse cards and repairs bad buckets', () => {
    const doc = migrateDoc({ cards: [{ title: 'x', bucketId: 'nope', effort: 9 }] });
    const c = doc.cards[0];
    expect(c.id).toBeTruthy();
    expect(c.kind).toBe('todo');
    expect(c.bucketId).toBe('today');
    expect(c.effort).toBeNull();
    expect(c.tags).toEqual([]);
  });

  it('rejects junk', () => {
    expect(() => migrateDoc(null)).toThrow();
    expect(() => migrateDoc({ cards: 'no' })).toThrow();
  });
});

describe('mergeDocs', () => {
  it('unions cards and lets the newer edit win', () => {
    const a = emptyDoc();
    const b = emptyDoc();
    const shared = newCard({ title: 'old', bucketId: 'today' });
    a.cards.push(shared, newCard({ title: 'only a', bucketId: 'today' }));
    b.cards.push({ ...shared, title: 'new', updatedAt: shared.updatedAt + 1 }, newCard({ title: 'only b', bucketId: 'today' }));
    const m = mergeDocs(a, b);
    expect(m.cards.length).toBe(3);
    expect(m.cards.find((c) => c.id === shared.id)!.title).toBe('new');
  });
});
