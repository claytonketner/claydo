import { describe, expect, it } from 'vitest';
import { asHref, findBucket, fuzzyFind, parseQuickAdd } from '../src/lib/model/parse';

const ctx = {
  people: [
    { id: 'p1', name: 'Helen' },
    { id: 'p2', name: 'Thomas Mullen' }
  ],
  buckets: [
    { id: 'today', name: 'Today' },
    { id: 'week', name: 'This week' },
    { id: 'soon', name: 'Soon-ish' },
    { id: 'else', name: 'Everything else' },
    { id: 'ideas', name: 'Ideas' }
  ]
};

describe('parseQuickAdd', () => {
  it('extracts every token kind and leaves a clean title', () => {
    const r = parseQuickAdd('Call vendor @helen #purchasing !s *3 >today // ask about lead time', ctx);
    expect(r.title).toBe('Call vendor');
    expect(r.peopleIds).toEqual(['p1']);
    expect(r.tags).toEqual(['purchasing']);
    expect(r.effort).toBe(2);
    expect(r.value).toBe(3);
    expect(r.bucketId).toBe('today');
    expect(r.notes).toBe('ask about lead time');
    expect(r.asChild).toBe(false);
  });

  it('treats a leading + as "child of selected"', () => {
    const r = parseQuickAdd('+ write the doc', ctx);
    expect(r.asChild).toBe(true);
    expect(r.title).toBe('write the doc');
  });

  it('marks ideas with a tilde, leading or standalone', () => {
    expect(parseQuickAdd('~ config as yaml', ctx)).toMatchObject({ isIdea: true, title: 'config as yaml' });
    expect(parseQuickAdd('config as yaml ~', ctx)).toMatchObject({ isIdea: true, title: 'config as yaml' });
    expect(parseQuickAdd('plain', ctx).isIdea).toBe(false);
  });

  it('returns unknown people so the caller can create them', () => {
    const r = parseQuickAdd('Sync with @matias', ctx);
    expect(r.peopleIds).toEqual([]);
    expect(r.newPeople).toEqual(['matias']);
  });

  it('matches people by word prefix', () => {
    expect(parseQuickAdd('x @mull', ctx).peopleIds).toEqual(['p2']);
    expect(parseQuickAdd('x @tho', ctx).peopleIds).toEqual(['p2']);
  });

  it('accepts effort as size words or numbers', () => {
    expect(parseQuickAdd('a !xl', ctx).effort).toBe(5);
    expect(parseQuickAdd('a !4', ctx).effort).toBe(4);
    expect(parseQuickAdd('a !huge', ctx).effort).toBe(5);
  });

  it('accepts value as stars or digits', () => {
    expect(parseQuickAdd('a ***', ctx).value).toBe(3);
    expect(parseQuickAdd('a *', ctx).value).toBe(1);
    expect(parseQuickAdd('a *2', ctx).value).toBe(2);
  });

  it('resolves bucket aliases', () => {
    expect(parseQuickAdd('a >week', ctx).bucketId).toBe('week');
    expect(parseQuickAdd('a >later', ctx).bucketId).toBe('else');
    expect(parseQuickAdd('a >soon', ctx).bucketId).toBe('soon');
    expect(parseQuickAdd('a >now', ctx).bucketId).toBe('today');
  });

  it('keeps words that only look like tokens', () => {
    const r = parseQuickAdd('Ping ops re: !!! and >zzz and lone !', ctx);
    expect(r.title).toBe('Ping ops re: !!! and >zzz and lone !');
    expect(r.effort).toBeNull();
    expect(r.bucketId).toBeNull();
  });
});

describe('findBucket / fuzzyFind', () => {
  it('prefers exact over prefix over substring', () => {
    const items = [{ name: 'Soonish' }, { name: 'Soon' }, { name: 'Not soon' }];
    expect(fuzzyFind(items, 'soon')!.name).toBe('Soon');
  });
  it('returns null for empty or unknown', () => {
    expect(findBucket(ctx.buckets, '')).toBeNull();
    expect(findBucket(ctx.buckets, 'zzz')).toBeNull();
  });
});

describe('asHref', () => {
  it('recognises urls and bare domains', () => {
    expect(asHref('https://example.com/x')).toBe('https://example.com/x');
    expect(asHref('example.com')).toBe('https://example.com');
    expect(asHref('hello')).toBeNull();
    expect(asHref('e.g.')).toBeNull();
  });
});
