import { describe, expect, it } from 'vitest';
import { matchesTerms, searchTerms } from '../src/lib/model/search';
import { newCard } from '../src/lib/model/seed';

const card = (title: string, notes = '', tags: string[] = []) => newCard({ title, notes, tags });

describe('searchTerms', () => {
  it('splits on whitespace and lowercases', () => {
    expect(searchTerms('  One   TWO ')).toEqual(['one', 'two']);
  });
  it('is empty for a blank query', () => {
    expect(searchTerms('   ')).toEqual([]);
  });
  it('keeps a quoted phrase together', () => {
    expect(searchTerms('one "two three" four')).toEqual(['one', 'two three', 'four']);
  });
  it('treats an unclosed quote as a phrase to the end', () => {
    expect(searchTerms('one "two thr')).toEqual(['one', 'two thr']);
  });
  it('accepts curly quotes and drops empty ones', () => {
    expect(searchTerms('\u201ctwo three\u201d')).toEqual(['two three']);
    expect(searchTerms('one ""')).toEqual(['one']);
  });
});

describe('matchesTerms', () => {
  it('matches any term, not all of them', () => {
    const terms = searchTerms('one two');
    expect(matchesTerms(card('just one'), terms)).toBe(true);
    expect(matchesTerms(card('just two'), terms)).toBe(true);
    expect(matchesTerms(card('neither'), terms)).toBe(false);
  });
  it('looks at notes and tags too', () => {
    expect(matchesTerms(card('a', 'mentions two'), searchTerms('one two'))).toBe(true);
    expect(matchesTerms(card('a', '', ['two']), searchTerms('one two'))).toBe(true);
  });
  it('matches a quoted phrase only where the words are adjacent', () => {
    const terms = searchTerms('"one two"');
    expect(matchesTerms(card('one two'), terms)).toBe(true);
    expect(matchesTerms(card('two and one'), terms)).toBe(false);
  });
  it('keeps everything when there are no terms', () => {
    expect(matchesTerms(card('anything'), [])).toBe(true);
  });
});
