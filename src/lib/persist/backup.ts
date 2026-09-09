import { DEFAULT_SETTINGS, defaultBuckets, newCard } from '../model/seed';
import type { Bucket, Card, Cluster, Doc } from '../model/types';

export function docToJson(doc: Doc): string {
  return JSON.stringify({ app: 'claydo', exportedAt: new Date().toISOString(), ...doc }, null, 2);
}

export function backupFilename(ts = Date.now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `claydo-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

export function downloadJson(doc: Doc, filename = backupFilename()): void {
  const blob = new Blob([docToJson(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Validate and normalise a parsed JSON object into a Doc, filling any missing
 * fields with defaults so older exports keep loading.
 */
export function migrateDoc(raw: unknown): Doc {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Claydo document');
  const r = raw as Partial<Doc> & Record<string, unknown>;
  if (!Array.isArray(r.cards)) throw new Error('Missing cards array');

  const buckets: Bucket[] = Array.isArray(r.buckets) && r.buckets.length ? r.buckets.map(normBucket) : defaultBuckets();
  const bucketIds = new Set(buckets.map((b) => b.id));
  const cards: Card[] = r.cards.map((c) => normCard(c, bucketIds));
  const clusters: Cluster[] = Array.isArray(r.clusters) ? r.clusters.filter((x): x is Cluster => !!x && typeof x.id === 'string') : [];
  const settings = { ...DEFAULT_SETTINGS, ...(typeof r.settings === 'object' && r.settings ? r.settings : {}) };
  if (!settings.defaultBucketId || !bucketIds.has(settings.defaultBucketId)) {
    settings.defaultBucketId = buckets.find((b) => b.kind === 'time')?.id ?? null;
  }
  return { version: 1, buckets, cards, clusters, settings };
}

function normBucket(b: Partial<Bucket>): Bucket {
  return {
    id: String(b.id ?? ''),
    name: String(b.name ?? 'Untitled'),
    order: Number(b.order ?? 0),
    budget: b.budget == null ? null : Number(b.budget),
    kind: (['time', 'people', 'ideas', 'done'] as const).includes(b.kind as never) ? (b.kind as Bucket['kind']) : 'time'
  };
}

function normCard(c: Partial<Card>, bucketIds: Set<string>): Card {
  const base = newCard({ title: String(c.title ?? '') });
  const out: Card = { ...base, ...c, title: String(c.title ?? '') };
  if (!out.id) out.id = base.id;
  if (!['todo', 'person', 'idea'].includes(out.kind)) out.kind = 'todo';
  if (out.bucketId && !bucketIds.has(out.bucketId)) out.bucketId = null;
  if (!out.parentId && !out.bucketId) out.bucketId = [...bucketIds][0] ?? null;
  out.tags = Array.isArray(out.tags) ? out.tags.map(String) : [];
  out.peopleIds = Array.isArray(out.peopleIds) ? out.peopleIds.map(String) : [];
  out.linkIds = Array.isArray(out.linkIds) ? out.linkIds.map(String) : [];
  out.pos = out.pos && typeof out.pos.x === 'number' ? out.pos : { x: 16, y: 16 };
  out.effort = out.effort != null && out.effort >= 1 && out.effort <= 5 ? out.effort : null;
  out.value = out.value != null && out.value >= 1 && out.value <= 3 ? out.value : null;
  return out;
}

export function parseDocJson(text: string): Doc {
  return migrateDoc(JSON.parse(text));
}

/** Union by id; the newer `updatedAt` wins for cards. Buckets/clusters from base win. */
export function mergeDocs(base: Doc, incoming: Doc): Doc {
  const cards = new Map(base.cards.map((c) => [c.id, c]));
  for (const c of incoming.cards) {
    const cur = cards.get(c.id);
    if (!cur || (c.updatedAt ?? 0) > (cur.updatedAt ?? 0)) cards.set(c.id, c);
  }
  const buckets = new Map(base.buckets.map((b) => [b.id, b]));
  for (const b of incoming.buckets) if (!buckets.has(b.id)) buckets.set(b.id, { ...b, order: buckets.size });
  const clusters = new Map(base.clusters.map((c) => [c.id, c]));
  for (const c of incoming.clusters) if (!clusters.has(c.id)) clusters.set(c.id, c);
  return {
    version: 1,
    buckets: [...buckets.values()].sort((a, b) => a.order - b.order),
    cards: [...cards.values()],
    clusters: [...clusters.values()],
    settings: base.settings
  };
}
