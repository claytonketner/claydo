import type { Card } from './types';

/**
 * Space-separated words are OR terms: "one two" matches anything containing either.
 * Wrapping words in quotes keeps them together as one phrase: `"one two"` matches only that phrase.
 * An unclosed quote still works, so matching narrows as the phrase is typed rather than flickering.
 */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  // Curly quotes come free from phone keyboards and pasted text.
  const q = query.toLowerCase().replace(/[“”]/g, '"');
  for (const m of q.matchAll(/"([^"]*)"?|(\S+)/g)) {
    const term = (m[1] ?? m[2]).trim();
    if (term) terms.push(term);
  }
  return terms;
}

export function matchesTerms(card: Card, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const title = card.title.toLowerCase();
  const notes = card.notes.toLowerCase();
  return terms.some((t) => title.includes(t) || notes.includes(t) || card.tags.some((tag) => tag.includes(t)));
}
