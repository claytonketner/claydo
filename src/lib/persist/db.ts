import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Doc } from '../model/types';

const main = createStore('claydo', 'main');
const snaps = createStore('claydo-snapshots', 'snapshots');

const DOC_KEY = 'doc';
const SNAPSHOT_LIMIT = 14;

export async function loadDoc(): Promise<Doc | null> {
  try {
    const raw = await get<Doc>(DOC_KEY, main);
    return raw ?? null;
  } catch (e) {
    console.warn('claydo: could not read IndexedDB', e);
    return null;
  }
}

export async function saveDoc(doc: Doc): Promise<void> {
  await set(DOC_KEY, doc, main);
}

function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface SnapshotMeta {
  key: string;
  savedAt: number;
  cardCount: number;
}

/** Save at most one snapshot per calendar day; keep the newest SNAPSHOT_LIMIT. */
export async function saveDailySnapshot(doc: Doc): Promise<boolean> {
  try {
    const key = dayKey();
    const existing = await get(key, snaps);
    if (existing) return false;
    await set(key, { savedAt: Date.now(), doc }, snaps);
    const all = (await keys<string>(snaps)).sort();
    while (all.length > SNAPSHOT_LIMIT) {
      const old = all.shift()!;
      await del(old, snaps);
    }
    return true;
  } catch (e) {
    console.warn('claydo: snapshot failed', e);
    return false;
  }
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const out: SnapshotMeta[] = [];
  for (const key of (await keys<string>(snaps)).sort().reverse()) {
    const entry = await get<{ savedAt: number; doc: Doc }>(key, snaps);
    if (entry) out.push({ key, savedAt: entry.savedAt, cardCount: entry.doc.cards.length });
  }
  return out;
}

export async function loadSnapshot(key: string): Promise<Doc | null> {
  const entry = await get<{ savedAt: number; doc: Doc }>(key, snaps);
  return entry?.doc ?? null;
}
