import type { Effort, Id, Value } from './types';

export interface ParseContext {
  people: { id: Id; name: string }[];
  buckets: { id: Id; name: string }[];
}

export interface ParsedQuickAdd {
  title: string;
  notes: string;
  peopleIds: Id[];
  /** @mentions that matched nobody; the caller creates them. */
  newPeople: string[];
  tags: string[];
  effort: Effort | null;
  value: Value | null;
  bucketId: Id | null;
  /** Leading "+" means "child of the selected card". */
  asChild: boolean;
}

const EFFORT_WORDS: Record<string, Effort> = {
  xs: 1, s: 2, m: 3, l: 4, xl: 5,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  tiny: 1, small: 2, med: 3, medium: 3, big: 4, large: 4, huge: 5
};

/** Common shorthand for bucket names. Matched by prefix against bucket names too. */
const BUCKET_ALIASES: Record<string, string> = {
  now: 'today',
  tod: 'today',
  wk: 'this week',
  week: 'this week',
  soon: 'soon-ish',
  later: 'everything else',
  else: 'everything else',
  someday: 'everything else',
  backlog: 'everything else',
  ideas: 'ideas',
  idea: 'ideas'
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Prefix/word match, case-insensitive, punctuation-insensitive. Returns best match or null. */
export function fuzzyFind<T extends { name: string }>(items: T[], query: string): T | null {
  const q = norm(query);
  if (!q) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const it of items) {
    const n = norm(it.name);
    let score = 0;
    if (n === q) score = 100;
    else if (n.startsWith(q)) score = 80;
    else if (n.split(' ').some((w) => w.startsWith(q))) score = 60;
    else if (n.includes(q)) score = 40;
    if (score > bestScore) {
      best = it;
      bestScore = score;
    }
  }
  return best;
}

export function findBucket(buckets: { id: Id; name: string }[], word: string): Id | null {
  const key = norm(word);
  const aliased = BUCKET_ALIASES[key] ?? key;
  const hit = fuzzyFind(buckets, aliased) ?? fuzzyFind(buckets, key);
  return hit ? hit.id : null;
}

/**
 * Parse quick-add syntax:
 *   +          leading: make it a child of the selected card
 *   @name      person (fuzzy; unknown names are returned in newPeople)
 *   #tag       tag
 *   !m !3      effort (xs s m l xl or 1-5)
 *   *3  ***    value 1-3
 *   >today     bucket (fuzzy, with aliases like >week >soon >later)
 *   // text    everything after is notes
 */
export function parseQuickAdd(input: string, ctx: ParseContext): ParsedQuickAdd {
  let text = input.trim();
  let notes = '';
  const sep = text.indexOf('//');
  if (sep >= 0) {
    notes = text.slice(sep + 2).trim();
    text = text.slice(0, sep).trim();
  }
  let asChild = false;
  if (text.startsWith('+')) {
    asChild = true;
    text = text.slice(1).trimStart();
  }

  const out: ParsedQuickAdd = {
    title: '',
    notes,
    peopleIds: [],
    newPeople: [],
    tags: [],
    effort: null,
    value: null,
    bucketId: null,
    asChild
  };

  const words: string[] = [];
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    const m = /^([@#!*>])(.*)$/.exec(raw);
    if (!m || (m[1] !== '*' && m[2].length === 0)) {
      words.push(raw);
      continue;
    }
    const [, sigil, body] = m;
    switch (sigil) {
      case '@': {
        const hit = fuzzyFind(ctx.people, body);
        if (hit) {
          if (!out.peopleIds.includes(hit.id)) out.peopleIds.push(hit.id);
        } else {
          const name = body.replace(/[-_]+/g, ' ');
          if (!out.newPeople.some((n) => n.toLowerCase() === name.toLowerCase())) out.newPeople.push(name);
        }
        break;
      }
      case '#': {
        const tag = body.toLowerCase();
        if (!out.tags.includes(tag)) out.tags.push(tag);
        break;
      }
      case '!': {
        const e = EFFORT_WORDS[body.toLowerCase()];
        if (e) out.effort = e;
        else words.push(raw);
        break;
      }
      case '*': {
        // "*3" or "***"
        if (/^\*{0,2}$/.test(body)) out.value = Math.min(3, body.length + 1) as Value;
        else if (/^[123]$/.test(body)) out.value = Number(body) as Value;
        else words.push(raw);
        break;
      }
      case '>': {
        const id = findBucket(ctx.buckets, body);
        if (id) out.bucketId = id;
        else words.push(raw);
        break;
      }
    }
  }
  out.title = words.join(' ').trim();
  return out;
}

/** Turn a URL-ish string into an <a>-safe href, or null if it's not a URL. */
export function asHref(word: string): string | null {
  if (/^https?:\/\/\S+$/i.test(word)) return word;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(word)) return `https://${word}`;
  return null;
}
