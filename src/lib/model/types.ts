export type Id = string;
export type Kind = 'todo' | 'person' | 'idea';
/** XS S M L XL */
export type Effort = 1 | 2 | 3 | 4 | 5;
/** low / med / high */
export type Value = 1 | 2 | 3;
export type BucketKind = 'time' | 'people' | 'ideas' | 'done';

export interface Card {
  id: Id;
  kind: Kind;
  title: string;
  /** Free text. URLs are auto-linked; lines starting with "- " render as a checklist. */
  notes: string;
  /** Hierarchy: sub-todos, or a person's agenda items. */
  parentId: Id | null;
  /** null on a child means "inherit from parent". Top-level cards always have one. */
  bucketId: Id | null;
  effort: Effort | null;
  value: Value | null;
  tags: string[];
  /** Person cards this relates to ("bring up with Helen"). */
  peopleIds: Id[];
  /** Related cards (idea <-> todo, todo <-> todo). Symmetric by convention. */
  linkIds: Id[];
  clusterId: Id | null;
  /** Position within its bucket tray in the default view. */
  pos: { x: number; y: number };
  color: string | null;
  createdAt: number;
  updatedAt: number;
  /** Last time it was edited or dragged; drives staleness. */
  touchedAt: number;
  doneAt: number | null;
  /** Soft-deleted; kept in the trash for 30 days. */
  deletedAt: number | null;
}

export interface Bucket {
  id: Id;
  name: string;
  order: number;
  /** Effort-point budget for the capacity meter; null = unlimited. */
  budget: number | null;
  kind: BucketKind;
}

export interface Cluster {
  id: Id;
  name: string | null;
  color: string;
}

export interface Settings {
  /** Bucket new cards land in when no >bucket token is given. */
  defaultBucketId: Id | null;
  /** Bucket most recently dropped into; wins over defaultBucketId when set. */
  lastDropBucketId: Id | null;
  /** Points a card with no effort (and no sized children) counts for. */
  defaultEffortPoints: number;
  /** Download a JSON backup every hour while the app is open (only if something changed). */
  autoBackup: boolean;
  lastBackupAt: number | null;
  /** Bumped when backup defaults change, so existing boards pick up the new default once. */
  backupVersion?: number;
  /** The user has made a deliberate backup choice (folder, downloads, or off). */
  backupAcknowledged?: boolean;
  celebrate: boolean;
  theme: 'light' | 'dark' | 'system';
  /** Show the yellowing/cracked/cobwebbed visual effect on old todos. */
  agingEnabled: boolean;
}

export interface Doc {
  version: 1;
  buckets: Bucket[];
  cards: Card[];
  clusters: Cluster[];
  settings: Settings;
}

export type ViewMode = 'bucket' | 'effort' | 'value' | 'person' | 'tag' | 'age' | 'matrix';

export const EFFORT_LABELS: Record<Effort, string> = { 1: 'XS', 2: 'S', 3: 'M', 4: 'L', 5: 'XL' };
export const EFFORT_POINTS: Record<Effort, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };
export const VALUE_LABELS: Record<Value, string> = { 1: 'low', 2: 'med', 3: 'high' };

export const CARD_W = 150;
export const CARD_H = 96;
