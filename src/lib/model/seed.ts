import { nid } from './ids';
import type { Bucket, Card, Doc, Effort, Id, Kind, Settings, Value } from './types';

export const DEFAULT_SETTINGS: Settings = {
  defaultBucketId: null,
  lastDropBucketId: null,
  defaultEffortPoints: 2,
  autoBackup: true,
  lastBackupAt: null,
  backupVersion: 2,
  backupAcknowledged: false,
  celebrate: true,
  theme: 'system',
  agingEnabled: true
};

export function defaultBuckets(): Bucket[] {
  return [
    { id: 'today', name: 'Today', order: 0, budget: 8, kind: 'time' },
    { id: 'week', name: 'This week', order: 1, budget: 20, kind: 'time' },
    { id: 'soon', name: 'Soon-ish', order: 2, budget: 40, kind: 'time' },
    { id: 'else', name: 'Everything else', order: 3, budget: null, kind: 'time' },
    { id: 'people', name: 'People', order: 4, budget: null, kind: 'people' },
    { id: 'ideas', name: 'Ideas', order: 5, budget: null, kind: 'ideas' },
    { id: 'done', name: 'Done', order: 6, budget: null, kind: 'done' }
  ];
}

export function emptyDoc(): Doc {
  return {
    version: 1,
    buckets: defaultBuckets(),
    cards: [],
    clusters: [],
    settings: { ...DEFAULT_SETTINGS, defaultBucketId: 'week' }
  };
}

export function newCard(partial: Partial<Card> & { title: string }, now = Date.now()): Card {
  return {
    id: nid(),
    kind: 'todo',
    notes: '',
    parentId: null,
    bucketId: null,
    effort: null,
    value: null,
    tags: [],
    peopleIds: [],
    linkIds: [],
    clusterId: null,
    pos: { x: 16, y: 16 },
    color: null,
    createdAt: now,
    updatedAt: now,
    touchedAt: now,
    doneAt: null,
    deletedAt: null,
    ...partial
  };
}

interface SeedSpec {
  title: string;
  kind?: Kind;
  bucket?: Id | null;
  notes?: string;
  effort?: Effort;
  value?: Value;
  tags?: string[];
  people?: string[];
  pos?: [number, number];
  ageDays?: number;
  children?: SeedSpec[];
  done?: number; // days ago
}

/** A small starter board so the app isn't empty on first launch. */
export function seedDoc(now = Date.now()): Doc {
  const doc = emptyDoc();
  const people = new Map<string, Id>();
  const DAY = 86_400_000;

  const add = (spec: SeedSpec, parentId: Id | null = null): Card => {
    const ts = now - (spec.ageDays ?? 0) * DAY;
    const card = newCard(
      {
        title: spec.title,
        kind: spec.kind ?? 'todo',
        parentId,
        bucketId: spec.bucket === undefined ? (parentId ? null : 'week') : spec.bucket,
        notes: spec.notes ?? '',
        effort: spec.effort ?? null,
        value: spec.value ?? null,
        tags: spec.tags ?? [],
        peopleIds: (spec.people ?? []).map((n) => people.get(n)!).filter(Boolean),
        pos: spec.pos ? { x: spec.pos[0], y: spec.pos[1] } : { x: 16, y: 16 },
        doneAt: spec.done != null ? now - spec.done * DAY : null
      },
      ts
    );
    card.createdAt = ts;
    doc.cards.push(card);
    if (spec.kind === 'person') people.set(spec.title, card.id);
    for (const child of spec.children ?? []) add(child, card.id);
    return card;
  };

  add({ title: 'Alex', kind: 'person', bucket: 'people', pos: [16, 16], children: [
    { title: 'Ask about the trip itinerary' }
  ] });
  add({ title: 'Sam', kind: 'person', bucket: 'people', pos: [190, 16] });
  add({ title: 'Jordan', kind: 'person', bucket: 'people', pos: [40, 150] });

  add({
    title: 'Welcome to Claydo',
    bucket: 'today',
    pos: [16, 16],
    effort: 2,
    value: 3,
    tags: ['meta'],
    notes: 'Drag me around. Double click to edit.\n- Try dropping a card onto another to nest it\n- Have fun!',
    children: [
      { title: 'Try the quick-add bar', notes: 'Type: "Call the plumber @sam #home !s *3 >today"' },
      { title: 'Switch views with the buttons up top' },
      { title: 'Give a sub-todo its own timeframe', bucket: 'week' }
    ]
  });
  add({ title: 'Reply to Sam\'s email', bucket: 'today', pos: [190, 16], effort: 1, ageDays: 1 });
  add({ title: 'Update the budget spreadsheet', bucket: 'today', pos: [190, 130], effort: 3, value: 2, ageDays: 3 });

  add({ title: 'Present quarterly report to the team', pos: [16, 16], effort: 3, value: 3, tags: ['work'], people: ['Alex'], ageDays: 2 });
  add({ title: 'Plan the weekend trip', pos: [16, 150], effort: 4, ageDays: 9 });
  add({ title: 'Write blog post draft', pos: [190, 150], effort: 4, value: 2, ageDays: 16 });

  add({ title: 'Schedule dentist appointment', bucket: 'soon', pos: [16, 16], effort: 2, ageDays: 20 });
  add({ title: 'Research a new laptop', bucket: 'soon', pos: [190, 16], effort: 5, value: 3, tags: ['shopping'], ageDays: 33 });

  add({ title: 'Clean out the garage', bucket: 'else', pos: [16, 16], ageDays: 40 });
  add({ title: 'Organize the photo library', bucket: 'else', pos: [190, 16], effort: 4, ageDays: 45, tags: ['home'] });

  add({ title: 'A simpler way to track habits', kind: 'idea', bucket: 'ideas', pos: [16, 16], notes: 'Sketch out a lightweight weekly view instead of daily checkboxes.' });

  add({ title: 'Book the venue', bucket: 'today', pos: [16, 16], done: 1, effort: 2 });
  add({ title: 'Renew car registration', bucket: 'week', pos: [190, 16], done: 3, effort: 3, value: 2 });
  add({ title: 'Send meeting notes to the team', bucket: 'week', pos: [364, 16], done: 6, effort: 1 });

  return doc;
}
