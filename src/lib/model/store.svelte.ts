import { bucketLoad, buildCapacityIndex, effectiveBucketId, type BucketLoad } from './capacity';
import { History } from './history';
import { nid } from './ids';
import { parseQuickAdd } from './parse';
import { emptyDoc, newCard, seedDoc } from './seed';
import { CARD_H, CARD_W, type Bucket, type Card, type Doc, type Effort, type Id, type Value, type ViewMode } from './types';
import { loadDoc, saveDailySnapshot, saveDoc } from '../persist/db';
import { downloadJson, mergeDocs } from '../persist/backup';
import { captureRects, centerOf, flyFrom } from '../physics/fx';
import { folderPermission, forgetBackupFolder, listBackupFiles, loadBackupFolder, pickBackupFolder, reconnectBackupFolder, supportsFolderBackup, writeFolderBackup, type BackupFileInfo, type DirHandle } from '../persist/folder';
import { tick } from 'svelte';

const SAVE_DEBOUNCE_MS = 300;

export class Store {
  doc = $state<Doc>(emptyDoc());
  loaded = $state(false);

  // UI state
  selectedId = $state<Id | null>(null);
  editingId = $state<Id | null>(null);
  view = $state<ViewMode>('bucket');
  focusStack = $state<Id[]>([]);
  search = $state('');
  settingsOpen = $state(false);
  reflectOpen = $state(false);
  trashOpen = $state(false);
  /** Reported by the Done tray so new arrivals can be spread out sensibly. */
  doneTrayWidth = $state(600);
  toast = $state<{ id: number; text: string; undo?: () => void } | null>(null);
  dirty = $state(false);
  lastCompletedId = $state<Id | null>(null);
  /** Folder-backup status for the UI. */
  backup = $state({
    supported: false,
    folder: null as { name: string; state: 'ok' | 'needs-permission' } | null,
    lastError: null as string | null
  });
  private folderHandle: DirHandle | null = null;
  /** Something about backups still needs the user's attention (badge + notice). */
  backupAttention = $derived.by(() => {
    if (this.backup.folder?.state === 'needs-permission') return true;
    if (this.backup.folder?.state === 'ok') return false;
    return !this.doc.settings.backupAcknowledged;
  });

  /** Where to throw the party when something gets finished (screen coords). */
  celebrateAt = $state<{ x: number; y: number; seq: number } | null>(null);
  private celebrateSeq = 0;
  /** A complete/delete waiting on the "what about the sub-items?" dialog. */
  pending = $state<{ action: 'complete' | 'delete'; id: Id; count: number } | null>(null);

  private history = new History<Doc>(100);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toastSeq = 0;

  // ---------- derived indexes ----------
  /** Everything not in the trash. Most queries go through this. */
  liveCards = $derived(this.doc.cards.filter((c) => c.deletedAt == null));
  /** Includes trashed cards, so restore and parent lookups still work. */
  byId = $derived(new Map(this.doc.cards.map((c) => [c.id, c])));
  trash = $derived(this.doc.cards.filter((c) => c.deletedAt != null).sort((a, b) => b.deletedAt! - a.deletedAt!));
  children = $derived.by(() => {
    const m = new Map<Id, Card[]>();
    for (const c of this.liveCards) {
      if (!c.parentId) continue;
      const arr = m.get(c.parentId) ?? [];
      arr.push(c);
      m.set(c.parentId, arr);
    }
    return m;
  });
  capIdx = $derived(buildCapacityIndex(this.liveCards, this.doc.settings.defaultEffortPoints));
  people = $derived(this.liveCards.filter((c) => c.kind === 'person' && c.doneAt == null).sort((a, b) => a.title.localeCompare(b.title)));
  openCards = $derived(this.liveCards.filter((c) => c.doneAt == null));
  doneCards = $derived(this.liveCards.filter((c) => c.doneAt != null).sort((a, b) => b.doneAt! - a.doneAt!));
  tags = $derived([...new Set(this.liveCards.flatMap((c) => c.tags))].sort());
  buckets = $derived([...this.doc.buckets].sort((a, b) => a.order - b.order));
  timeBuckets = $derived(this.buckets.filter((b) => b.kind === 'time'));
  loads = $derived.by(() => {
    const m = new Map<Id, BucketLoad>();
    for (const b of this.buckets) m.set(b.id, bucketLoad(b, this.liveCards, this.capIdx));
    return m;
  });
  focusedId = $derived(this.focusStack.at(-1) ?? null);
  focused = $derived(this.focusedId ? (this.byId.get(this.focusedId) ?? null) : null);
  selected = $derived(this.selectedId ? (this.byId.get(this.selectedId) ?? null) : null);
  canUndo = $derived.by(() => {
    void this.doc;
    return this.history.canUndo;
  });
  canRedo = $derived.by(() => {
    void this.doc;
    return this.history.canRedo;
  });

  // ---------- lifecycle ----------
  async init(): Promise<void> {
    const existing = await loadDoc();
    this.doc = existing ?? seedDoc();
    this.purgeTrash();
    // Boards saved before hourly backups existed get the new default once.
    if ((this.doc.settings.backupVersion ?? 0) < 2) {
      this.doc.settings.autoBackup = true;
      this.doc.settings.backupVersion = 2;
      this.scheduleSave();
    }
    this.loaded = true;
    if (existing) void saveDailySnapshot($state.snapshot(this.doc));
    else this.scheduleSave();
    // Ask the browser not to evict our storage under pressure.
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* not available */
    }
    this.backup.supported = supportsFolderBackup();
    await this.loadFolder();
    void this.maybeAutoBackup();
    // Keep checking while the app stays open.
    setInterval(() => void this.maybeAutoBackup(), 5 * 60_000);
  }

  // ---------- backups ----------
  private async loadFolder(): Promise<void> {
    if (!this.backup.supported) return;
    const h = await loadBackupFolder();
    this.folderHandle = h;
    if (!h) {
      this.backup.folder = null;
      return;
    }
    const perm = await folderPermission(h);
    this.backup.folder = { name: h.name || 'backup folder', state: perm === 'granted' ? 'ok' : 'needs-permission' };
  }

  /** Let the user pick (or change) the backup folder. Must run from a click. */
  async chooseFolder(mode: 'quick' | 'pick' = 'pick'): Promise<void> {
    try {
      const h = await pickBackupFolder(mode);
      if (!h) return;
      this.folderHandle = h;
      this.backup.folder = { name: h.name || 'backup folder', state: 'ok' };
      this.backup.lastError = null;
      this.updateSettings({ backupAcknowledged: true });
      await this.maybeAutoBackup(true);
      this.showToast(`Backing up to "${h.name || 'the chosen folder'}"`);
    } catch (e) {
      this.backup.lastError = (e as Error).message;
      this.showToast(`Couldn't use that folder: ${(e as Error).message}`);
    }
  }

  /** Re-grant folder access after a browser restart. Must run from a click. */
  async reconnectFolder(): Promise<void> {
    if (!this.folderHandle) return;
    const perm = await reconnectBackupFolder(this.folderHandle);
    if (perm === 'granted') {
      this.backup.folder = { name: this.folderHandle.name, state: 'ok' };
      await this.maybeAutoBackup(true);
      this.showToast('Backup folder reconnected');
    } else this.showToast('Folder access was not granted');
  }

  /** Write a backup right now (folder if set, otherwise a download). */
  async backupNow(): Promise<void> {
    await this.maybeAutoBackup(true);
    if (this.backup.folder?.state === 'ok' && !this.backup.lastError) this.showToast(`Backed up to "${this.backup.folder.name}"`);
    else if (!this.backup.folder) this.showToast('Backup downloaded');
  }

  /** Files in the backup folder, for the listing in Settings. */
  async backupFiles(): Promise<BackupFileInfo[]> {
    if (!this.folderHandle || this.backup.folder?.state !== 'ok') return [];
    try {
      return await listBackupFiles(this.folderHandle);
    } catch {
      return [];
    }
  }

  async forgetFolder(): Promise<void> {
    await forgetBackupFolder();
    this.folderHandle = null;
    this.backup.folder = null;
    this.showToast('Backup folder disconnected');
  }

  /** Record the user's explicit choice for the download fallback. */
  acknowledgeBackups(mode: 'download' | 'off'): void {
    this.updateSettings({ autoBackup: mode === 'download', backupAcknowledged: true });
    if (mode === 'download') void this.maybeAutoBackup(true);
  }

  /** Flush pending save immediately (for pagehide). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) {
      await saveDoc($state.snapshot(this.doc));
      this.dirty = false;
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    this.changedSinceBackup = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void saveDoc($state.snapshot(this.doc)).then(() => (this.dirty = false));
    }, SAVE_DEBOUNCE_MS);
  }

  /** Changes since the last backup file was written. */
  private changedSinceBackup = false;
  /** Folder backups are silent, so hourly; downloads interrupt, so daily. */
  static FOLDER_INTERVAL_MS = 60 * 60_000;
  static DOWNLOAD_INTERVAL_MS = 24 * 60 * 60_000;

  /**
   * Back up if one is due and something changed: silently into the chosen
   * folder when there is one, otherwise a download (if enabled).
   */
  async maybeAutoBackup(force = false): Promise<void> {
    const s = this.doc.settings;
    const useFolder = !!this.folderHandle && this.backup.folder?.state === 'ok';
    // Downloads interrupt, so they wait until the user has confirmed that choice.
    if (!useFolder && !(s.autoBackup && s.backupAcknowledged) && !force) return;
    const interval = useFolder ? Store.FOLDER_INTERVAL_MS : Store.DOWNLOAD_INTERVAL_MS;
    if (!force) {
      if (s.lastBackupAt && Date.now() - s.lastBackupAt < interval) return;
      if (s.lastBackupAt && !this.changedSinceBackup) return;
    }
    const snapshot = $state.snapshot(this.doc) as Doc;
    if (useFolder) {
      try {
        await writeFolderBackup(this.folderHandle!, snapshot);
        this.backup.lastError = null;
      } catch (e) {
        // Permission usually lapses after a browser restart; ask for a click.
        this.backup.lastError = (e as Error).message;
        if (this.folderHandle && (await folderPermission(this.folderHandle)) !== 'granted') {
          this.backup.folder = { name: this.folderHandle.name, state: 'needs-permission' };
        }
        return;
      }
    } else {
      downloadJson(snapshot);
    }
    s.lastBackupAt = Date.now();
    this.changedSinceBackup = false;
    this.scheduleSave();
  }

  /** Run `fn`, then fly any board card that moved to its new place. */
  private animated(fn: () => void): void {
    const before = captureRects();
    fn();
    void tick().then(() => flyFrom(before));
  }

  /** Wrap a mutation in an undo checkpoint and a save. */
  commit(label: string, fn: () => void): void {
    this.history.record($state.snapshot(this.doc) as Doc, label);
    fn();
    this.scheduleSave();
  }

  undo(): void {
    const prev = this.history.undo($state.snapshot(this.doc) as Doc);
    if (!prev) return;
    this.animated(() => (this.doc = prev));
    this.scheduleSave();
    this.showToast('Undone');
  }

  redo(): void {
    const next = this.history.redo($state.snapshot(this.doc) as Doc);
    if (!next) return;
    this.animated(() => (this.doc = next));
    this.scheduleSave();
    this.showToast('Redone');
  }

  showToast(text: string, undo?: () => void, ms = 2600): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { id: ++this.toastSeq, text, undo };
    this.toastTimer = setTimeout(() => (this.toast = null), ms);
  }

  // ---------- queries ----------
  card(id: Id | null | undefined): Card | null {
    return id ? (this.byId.get(id) ?? null) : null;
  }
  /** Like card(), but null for anything in the trash. */
  live(id: Id | null | undefined): Card | null {
    const c = this.card(id);
    return c && c.deletedAt == null ? c : null;
  }
  childrenOf(id: Id): Card[] {
    return this.children.get(id) ?? [];
  }
  openChildrenOf(id: Id): Card[] {
    return this.childrenOf(id).filter((c) => c.doneAt == null);
  }
  bucketOf(card: Card): Bucket | null {
    const bid = effectiveBucketId(card, this.byId);
    return bid ? (this.doc.buckets.find((b) => b.id === bid) ?? null) : null;
  }
  /** Cards that show on a bucket tray in the default view: explicit bucket, not done. */
  cardsInBucket(bucketId: Id): Card[] {
    return this.openCards.filter((c) => c.bucketId === bucketId);
  }
  /** A talking point living on a person's agenda only: no timeframe, so it never reaches the board. */
  isAgendaItem(card: Card): boolean {
    return card.bucketId == null && this.card(card.parentId)?.kind === 'person';
  }
  /** Cards elsewhere on the board that reference this person. */
  mentionsOf(personId: Id): Card[] {
    return this.openCards.filter((c) => c.peopleIds.includes(personId) && c.parentId !== personId);
  }
  isDescendant(id: Id, ancestorId: Id): boolean {
    let cur = this.byId.get(id);
    const seen = new Set<Id>();
    while (cur?.parentId) {
      if (cur.parentId === ancestorId) return true;
      if (seen.has(cur.id)) return false;
      seen.add(cur.id);
      cur = this.byId.get(cur.parentId);
    }
    return false;
  }
  get defaultBucketId(): Id {
    const s = this.doc.settings;
    const ok = (id: Id | null) => !!id && this.doc.buckets.some((b) => b.id === id && b.kind === 'time');
    if (ok(s.lastDropBucketId)) return s.lastDropBucketId!;
    if (ok(s.defaultBucketId)) return s.defaultBucketId!;
    return this.timeBuckets[0]?.id ?? this.doc.buckets[0].id;
  }

  /** First grid cell in a tray not overlapping an existing card. */
  freeSpot(bucketId: Id, excludeId?: Id): { x: number; y: number } {
    const others = this.cardsInBucket(bucketId).filter((c) => c.id !== excludeId);
    const gx = CARD_W + 14;
    const gy = CARD_H + 14;
    for (let row = 0; row < 40; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 16 + col * gx;
        const y = 16 + row * gy;
        const clash = others.some((o) => Math.abs(o.pos.x - x) < CARD_W * 0.6 && Math.abs(o.pos.y - y) < CARD_H * 0.6);
        if (!clash) return { x, y };
      }
    }
    return { x: 16, y: 16 };
  }

  // ---------- mutations ----------
  addCard(input: Partial<Card> & { title: string }, opts: { select?: boolean; edit?: boolean } = {}): Card {
    const card = newCard(input);
    if (card.parentId && this.byId.get(card.parentId)?.kind === 'person' && !card.peopleIds.includes(card.parentId)) {
      card.peopleIds = [...card.peopleIds, card.parentId];
    }
    if (!card.parentId && !card.bucketId) card.bucketId = this.defaultBucketId;
    if (card.bucketId && input.pos === undefined) card.pos = this.freeSpot(card.bucketId);
    this.commit('add card', () => this.doc.cards.push(card));
    if (opts.select !== false) this.selectedId = card.id;
    if (opts.edit) this.editingId = card.id;
    return card;
  }

  updateCard(id: Id, patch: Partial<Card>, opts: { touch?: boolean; label?: string } = {}): void {
    const c = this.byId.get(id);
    if (!c) return;
    this.commit(opts.label ?? 'edit card', () => {
      Object.assign(c, patch);
      c.updatedAt = Date.now();
      if (opts.touch !== false) c.touchedAt = c.updatedAt;
    });
  }

  /** Position change only (no history entry, dragging is noisy). Call `touch` on drop end. */
  setPos(id: Id, pos: { x: number; y: number }): void {
    const c = this.byId.get(id);
    if (!c) return;
    c.pos = { x: Math.max(0, Math.round(pos.x)), y: Math.max(0, Math.round(pos.y)) };
    c.touchedAt = Date.now();
    this.scheduleSave();
  }

  /** Batch position update after a relayout (no history entry, like setPos). */
  setPositions(changes: { id: Id; pos: { x: number; y: number } }[]): void {
    let any = false;
    for (const ch of changes) {
      const c = this.byId.get(ch.id);
      if (!c) continue;
      const x = Math.max(0, Math.round(ch.pos.x));
      const y = Math.max(0, Math.round(ch.pos.y));
      if (c.pos.x === x && c.pos.y === y) continue;
      c.pos = { x, y };
      any = true;
    }
    if (any) this.scheduleSave();
  }

  moveToBucket(id: Id, bucketId: Id, pos?: { x: number; y: number }): void {
    const c = this.byId.get(id);
    if (!c) return;
    const bucket = this.doc.buckets.find((b) => b.id === bucketId);
    if (!bucket) return;
    if (bucket.kind === 'done') {
      this.requestComplete(id);
      return;
    }
    // Only people live on the People tray; todos get there by joining an agenda.
    if (bucket.kind === 'people' && c.kind !== 'person') return;
    const oldCluster = c.bucketId !== bucketId ? c.clusterId : null;
    this.commit('move card', () => {
      c.bucketId = bucketId;
      c.pos = pos ? { x: Math.max(0, Math.round(pos.x)), y: Math.max(0, Math.round(pos.y)) } : this.freeSpot(bucketId, id);
      if (oldCluster) {
        c.clusterId = null;
        this.pruneCluster(oldCluster);
      }
      c.touchedAt = c.updatedAt = Date.now();
      if (bucket.kind === 'time') this.doc.settings.lastDropBucketId = bucketId;
      if (bucket.kind === 'ideas' && c.kind === 'todo') c.kind = 'idea';
      if (bucket.kind === 'time' && c.kind === 'idea') c.kind = 'todo';
    });
  }

  nest(childId: Id, parentId: Id): boolean {
    if (childId === parentId) return false;
    const child = this.byId.get(childId);
    const parent = this.byId.get(parentId);
    if (!child || !parent || child.kind === 'person') return false;
    if (this.isDescendant(parentId, childId)) return false;
    const oldCluster = child.clusterId;
    this.commit('nest card', () => {
      // Re-append so children (and agendas) list in the order they were added.
      const i = this.doc.cards.indexOf(child);
      if (i >= 0) {
        this.doc.cards.splice(i, 1);
        this.doc.cards.push(child);
      }
      child.parentId = parentId;
      child.bucketId = null;
      if (parent.kind === 'person' && !child.peopleIds.includes(parentId)) {
        child.peopleIds = [...child.peopleIds, parentId];
      }
      if (oldCluster) {
        child.clusterId = null;
        this.pruneCluster(oldCluster);
      }
      child.touchedAt = child.updatedAt = Date.now();
      parent.touchedAt = Date.now();
    });
    return true;
  }

  unnest(id: Id, bucketId?: Id): void {
    const c = this.byId.get(id);
    if (!c || !c.parentId) return;
    const target = bucketId ?? effectiveBucketId(c, this.byId) ?? this.defaultBucketId;
    this.commit('un-nest card', () => {
      c.parentId = null;
      c.bucketId = target;
      c.pos = this.freeSpot(target, id);
      c.touchedAt = c.updatedAt = Date.now();
    });
  }

  complete(id: Id): void {
    const c = this.byId.get(id);
    if (!c || c.kind === 'person') return;
    const now = Date.now();
    const before = captureRects();
    this.commit('complete', () => {
      c.doneAt = now;
      c.updatedAt = now;
      // Done tray is a timeline: y comes from order; pick an x that overlaps the least.
      c.pos = { x: this.doneSpotX(), y: 0 };
    });
    void tick().then(() => flyFrom(before));
    this.celebrate(centerOf(before.get(id)));
    this.lastCompletedId = id;
    if (this.selectedId === id) this.selectedId = null;
    this.showToast(`Done: ${c.title || 'untitled'}`, () => this.reopen(id));
  }

  /**
   * Where a newly finished card lands in the Done timeline: among all x
   * positions, find those that overlap the cards already near the top the
   * least, then pick one of them at random so the pile doesn't look too neat.
   */
  private doneSpotX(): number {
    const STEP = 34;
    const H = 64;
    const maxX = Math.max(0, this.doneTrayWidth - CARD_W - 8);
    // Cards already done, in timeline order; after the shift they sit at y = 16 + (i+1)*STEP.
    const recent = this.doneCards.filter((c) => c.kind !== 'person').slice(0, 8);
    const overlapAt = (x: number) =>
      recent.reduce((sum, r, i) => {
        const w = Math.min(x + CARD_W, Math.min(r.pos.x, maxX) + CARD_W) - Math.max(x, Math.min(r.pos.x, maxX));
        const h = H - (i + 1) * STEP;
        return w > 0 && h > 0 ? sum + w * h : sum;
      }, 0);
    const candidates: number[] = [];
    let best = Infinity;
    for (let x = 0; x <= maxX; x += 6) {
      const o = overlapAt(x);
      if (o < best - 1) {
        best = o;
        candidates.length = 0;
      }
      if (o <= best + 1) candidates.push(x);
    }
    if (!candidates.length) return 0;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private celebrate(at: { x: number; y: number } | null): void {
    if (!this.doc.settings.celebrate) return;
    const p = at ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.celebrateAt = { ...p, seq: ++this.celebrateSeq };
  }

  reopen(id: Id): void {
    const c = this.byId.get(id);
    if (!c) return;
    this.animated(() => this.commit('reopen', () => {
      c.doneAt = null;
      c.touchedAt = c.updatedAt = Date.now();
      if (!c.parentId && !c.bucketId) c.bucketId = this.defaultBucketId;
      if (c.bucketId) c.pos = this.freeSpot(c.bucketId, id);
    }));
  }

  /** Reset a cracked old card to like-new. */
  refresh(id: Id): void {
    const now = Date.now();
    this.updateCard(id, { createdAt: now }, { label: 'refresh' });
    this.showToast('Good as new');
  }

  /** Every card below `id` in the hierarchy. */
  descendantsOf(id: Id): Card[] {
    const out: Card[] = [];
    const seen = new Set<Id>([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const k of this.childrenOf(cur)) {
        if (seen.has(k.id)) continue;
        seen.add(k.id);
        out.push(k);
        queue.push(k.id);
      }
    }
    return out;
  }

  /** Detach direct children and put them back on the board. */
  private releaseChildren(id: Id): void {
    const parent = this.byId.get(id);
    const fallback = (parent && effectiveBucketId(parent, this.byId)) ?? this.defaultBucketId;
    const target = this.doc.buckets.find((b) => b.id === fallback && b.kind !== 'people' && b.kind !== 'done')?.id ?? this.defaultBucketId;
    for (const k of this.childrenOf(id)) {
      k.parentId = null;
      if (!k.bucketId) {
        k.bucketId = target;
        k.pos = this.freeSpot(target, k.id);
      }
      k.updatedAt = Date.now();
    }
  }

  /** Complete, asking first when there are open sub-items. */
  requestComplete(id: Id): void {
    const c = this.byId.get(id);
    if (!c || c.kind === 'person' || c.doneAt != null) return;
    const open = this.descendantsOf(id).filter((d) => d.doneAt == null).length;
    if (open > 0) this.pending = { action: 'complete', id, count: open };
    else this.complete(id);
  }

  /** Delete, asking first when there are sub-items. */
  requestDelete(id: Id): void {
    const c = this.byId.get(id);
    if (!c) return;
    const n = this.descendantsOf(id).length;
    if (n > 0) this.pending = { action: 'delete', id, count: n };
    else this.deleteCard(id);
  }

  /** Answer the dialog: apply to `all` sub-items too, or `one` (sub-items return to the board). */
  resolvePending(mode: 'all' | 'one' | 'cancel'): void {
    const p = this.pending;
    this.pending = null;
    if (!p || mode === 'cancel') return;
    if (p.action === 'complete') {
      if (mode === 'all') this.completeAll(p.id);
      else {
        this.commit('release sub-items', () => this.releaseChildren(p.id));
        this.complete(p.id);
      }
    } else {
      this.deleteCard(p.id, mode === 'all' ? 'all' : 'release');
    }
  }

  private completeAll(id: Id): void {
    const c = this.byId.get(id);
    if (!c) return;
    const now = Date.now();
    const all = [c, ...this.descendantsOf(id)].filter((x) => x.doneAt == null && x.kind !== 'person');
    const before = captureRects();
    this.commit('complete all', () => {
      for (const x of all) {
        x.doneAt = now;
        x.updatedAt = now;
        x.pos = { x: this.doneSpotX(), y: 0 };
      }
    });
    void tick().then(() => flyFrom(before));
    this.celebrate(centerOf(before.get(id)));
    this.lastCompletedId = id;
    if (this.selectedId && all.some((x) => x.id === this.selectedId)) this.selectedId = null;
    this.showToast(`Done: ${c.title || 'untitled'} + ${all.length - 1} sub-items`, () => this.undo());
  }

  deleteCard(id: Id, children: 'all' | 'release' = 'all'): void {
    const c = this.byId.get(id);
    if (!c) return;
    const doomed = new Set<Id>([id]);
    if (children === 'all') for (const d of this.descendantsOf(id)) doomed.add(d.id);
    const title = c.title;
    const now = Date.now();
    this.commit('delete', () => {
      if (children === 'release') this.releaseChildren(id);
      for (const x of this.doc.cards) {
        if (doomed.has(x.id)) {
          x.deletedAt = now;
          if (x.clusterId) {
            const cl = x.clusterId;
            x.clusterId = null;
            this.pruneCluster(cl);
          }
        }
      }
    });
    if (this.selectedId && doomed.has(this.selectedId)) this.selectedId = null;
    if (this.editingId && doomed.has(this.editingId)) this.editingId = null;
    this.focusStack = this.focusStack.filter((f) => !doomed.has(f));
    const n = doomed.size;
    this.showToast(`Trashed ${n > 1 ? `${n} cards` : title || 'card'}`, () => this.undo());
  }

  // ---------- trash ----------
  static TRASH_DAYS = 30;

  /** Bring a card back from the trash, with any sub-items trashed alongside it. */
  restore(id: Id): void {
    const c = this.byId.get(id);
    if (!c || c.deletedAt == null) return;
    const group = [c, ...this.trashedDescendants(id)];
    const before = captureRects();
    this.commit('restore', () => {
      for (const x of group) x.deletedAt = null;
      const parent = c.parentId ? this.byId.get(c.parentId) : null;
      if (c.parentId && (!parent || parent.deletedAt != null)) {
        c.parentId = null;
        c.bucketId = null;
      }
      if (!c.parentId) {
        const bucketOk = c.bucketId && this.doc.buckets.some((b) => b.id === c.bucketId);
        if (!bucketOk) c.bucketId = c.kind === 'person' ? (this.doc.buckets.find((b) => b.kind === 'people')?.id ?? this.defaultBucketId) : this.defaultBucketId;
        if (c.doneAt == null) c.pos = this.freeSpot(c.bucketId!, c.id);
      }
      c.updatedAt = Date.now();
    });
    void tick().then(() => flyFrom(before));
    this.showToast(`Restored ${c.title || 'card'}`, () => this.undo());
  }

  private trashedDescendants(id: Id): Card[] {
    const out: Card[] = [];
    const queue = [id];
    const seen = new Set<Id>([id]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const k of this.doc.cards) {
        if (k.parentId === cur && k.deletedAt != null && !seen.has(k.id)) {
          seen.add(k.id);
          out.push(k);
          queue.push(k.id);
        }
      }
    }
    return out;
  }

  /** Permanently drop anything trashed more than TRASH_DAYS ago (or everything, when `all`). */
  purgeTrash(all = false): void {
    const cutoff = Date.now() - Store.TRASH_DAYS * 86_400_000;
    const gone = new Set(this.doc.cards.filter((c) => c.deletedAt != null && (all || c.deletedAt < cutoff)).map((c) => c.id));
    if (!gone.size) return;
    const apply = () => {
      this.doc.cards = this.doc.cards.filter((c) => !gone.has(c.id));
      for (const x of this.doc.cards) {
        x.peopleIds = x.peopleIds.filter((p) => !gone.has(p));
        x.linkIds = x.linkIds.filter((l) => !gone.has(l));
        if (x.parentId && gone.has(x.parentId)) {
          x.parentId = null;
          if (!x.bucketId) x.bucketId = this.defaultBucketId;
        }
      }
    };
    if (all) this.commit('empty trash', apply);
    else {
      apply();
      this.scheduleSave();
    }
  }

  duplicate(id: Id): Card | null {
    const c = this.byId.get(id);
    if (!c) return null;
    const copy = newCard({
      ...($state.snapshot(c) as Card),
      id: nid(),
      title: c.title,
      doneAt: null,
      pos: { x: c.pos.x + 24, y: c.pos.y + 24 }
    });
    const now = Date.now();
    copy.createdAt = copy.updatedAt = copy.touchedAt = now;
    copy.deletedAt = null;
    this.commit('duplicate', () => this.doc.cards.push(copy));
    this.selectedId = copy.id;
    this.focus(copy.id);
    return copy;
  }

  /** Pull a nested card out to a board tray at a given spot. */
  unnestTo(id: Id, bucketId: Id, pos?: { x: number; y: number }): void {
    const c = this.byId.get(id);
    const bucket = this.doc.buckets.find((b) => b.id === bucketId);
    if (!c || !bucket) return;
    this.commit('un-nest card', () => {
      c.parentId = null;
      c.bucketId = bucketId;
      c.pos = pos ?? this.freeSpot(bucketId, id);
      c.touchedAt = c.updatedAt = Date.now();
      if (bucket.kind === 'ideas' && c.kind === 'todo') c.kind = 'idea';
      if (bucket.kind === 'time' && c.kind === 'idea') c.kind = 'todo';
    });
  }

  // ---------- clusters (loose grouping) ----------
  private static CLUSTER_COLORS = ['#ff6b4a', '#4a9bff', '#67c26b', '#f2b134', '#b07cff', '#ff7ab6', '#2bb5b0'];

  clusterOf(id: Id) {
    const c = this.byId.get(id);
    return c?.clusterId ? (this.doc.clusters.find((k) => k.id === c.clusterId) ?? null) : null;
  }
  clusterMembers(clusterId: Id): Card[] {
    return this.liveCards.filter((c) => c.clusterId === clusterId && c.doneAt == null);
  }

  /** Put `a` in `b`'s cluster (creating one if needed). */
  group(a: Id, b: Id): void {
    const ca = this.byId.get(a);
    const cb = this.byId.get(b);
    if (!ca || !cb || a === b) return;
    if (ca.clusterId && ca.clusterId === cb.clusterId) return;
    this.commit('group', () => {
      let cid = cb.clusterId;
      if (!cid) {
        cid = nid();
        const color = Store.CLUSTER_COLORS[this.doc.clusters.length % Store.CLUSTER_COLORS.length];
        this.doc.clusters.push({ id: cid, name: null, color });
        cb.clusterId = cid;
      }
      const old = ca.clusterId;
      ca.clusterId = cid;
      ca.updatedAt = cb.updatedAt = Date.now();
      if (old) this.pruneCluster(old);
    });
  }

  ungroup(id: Id): void {
    const c = this.byId.get(id);
    if (!c?.clusterId) return;
    const old = c.clusterId;
    this.commit('ungroup', () => {
      c.clusterId = null;
      c.updatedAt = Date.now();
      this.pruneCluster(old);
    });
  }

  /** Break a group up entirely. */
  dissolveCluster(clusterId: Id): void {
    const members = this.doc.cards.filter((c) => c.clusterId === clusterId);
    if (!members.length) return;
    this.commit('ungroup all', () => {
      for (const m of members) m.clusterId = null;
      this.doc.clusters = this.doc.clusters.filter((k) => k.id !== clusterId);
    });
    this.showToast(`Ungrouped ${members.length} cards`, () => this.undo());
  }

  private pruneCluster(clusterId: Id): void {
    const members = this.doc.cards.filter((c) => c.clusterId === clusterId);
    if (members.length <= 1) {
      for (const m of members) m.clusterId = null;
      this.doc.clusters = this.doc.clusters.filter((k) => k.id !== clusterId);
    }
  }

  setEffort(id: Id, effort: Effort | null): void {
    const c = this.byId.get(id);
    if (!c) return;
    this.updateCard(id, { effort: c.effort === effort ? null : effort }, { label: 'set effort' });
  }
  setValue(id: Id, value: Value | null): void {
    const c = this.byId.get(id);
    if (!c) return;
    this.updateCard(id, { value: c.value === value ? null : value }, { label: 'set value' });
  }

  addPerson(name: string): Card {
    const bucket = this.doc.buckets.find((b) => b.kind === 'people');
    return this.addCard({ title: name.trim(), kind: 'person', bucketId: bucket?.id ?? this.defaultBucketId }, { select: false });
  }
  ensurePeople(names: string[]): Id[] {
    return names.map((n) => {
      const hit = this.people.find((p) => p.title.toLowerCase() === n.toLowerCase());
      return hit ? hit.id : this.addPerson(n).id;
    });
  }

  togglePerson(cardId: Id, personId: Id): void {
    const c = this.byId.get(cardId);
    if (!c) return;
    const has = c.peopleIds.includes(personId);
    this.updateCard(cardId, { peopleIds: has ? c.peopleIds.filter((p) => p !== personId) : [...c.peopleIds, personId] }, { label: 'link person' });
  }

  toggleLink(a: Id, b: Id): void {
    const ca = this.byId.get(a);
    const cb = this.byId.get(b);
    if (!ca || !cb || a === b) return;
    const has = ca.linkIds.includes(b);
    this.commit(has ? 'unlink' : 'link', () => {
      ca.linkIds = has ? ca.linkIds.filter((x) => x !== b) : [...ca.linkIds, b];
      cb.linkIds = has ? cb.linkIds.filter((x) => x !== a) : [...cb.linkIds, a];
      ca.updatedAt = cb.updatedAt = Date.now();
    });
  }

  /**
   * Quick-add: parse tokens, create people as needed, and add the card. When
   * `parentId` is given (focus mode / person agenda) the card nests there.
   */
  quickAdd(text: string, opts: { parentId?: Id | null; bucketId?: Id | null } = {}): Card | null {
    const parsed = parseQuickAdd(text, {
      people: this.people.map((p) => ({ id: p.id, name: p.title })),
      buckets: this.doc.buckets.filter((b) => b.kind !== 'done').map((b) => ({ id: b.id, name: b.name }))
    });
    if (!parsed.title && !parsed.notes) return null;
    const peopleIds = [...parsed.peopleIds, ...this.ensurePeople(parsed.newPeople)];
    let parentId = opts.parentId ?? null;
    if (parsed.asChild && this.selectedId && this.selectedId !== parentId) parentId = this.selectedId;
    const ideasBucket = this.doc.buckets.find((b) => b.kind === 'ideas');
    let bucketId = parsed.bucketId ?? (parentId ? null : (opts.bucketId ?? this.defaultBucketId));
    if (parsed.isIdea && !parsed.bucketId && !parentId && ideasBucket) bucketId = ideasBucket.id;
    const bucket = bucketId ? this.doc.buckets.find((b) => b.id === bucketId) : null;
    const kind = bucket?.kind === 'people' ? 'person' : bucket?.kind === 'ideas' || parsed.isIdea ? 'idea' : 'todo';
    return this.addCard(
      {
        title: parsed.title || parsed.notes.slice(0, 60),
        notes: parsed.title ? parsed.notes : '',
        kind,
        parentId,
        bucketId,
        effort: parsed.effort,
        value: parsed.value,
        tags: parsed.tags,
        peopleIds
      },
      { select: !parentId }
    );
  }

  // ---------- buckets & settings ----------
  updateBucket(id: Id, patch: Partial<Bucket>): void {
    const b = this.doc.buckets.find((x) => x.id === id);
    if (!b) return;
    this.commit('edit bucket', () => Object.assign(b, patch));
  }
  addTimeBucket(name: string): void {
    const order = Math.max(...this.timeBuckets.map((b) => b.order), -1) + 1;
    this.commit('add bucket', () => {
      for (const b of this.doc.buckets) if (b.order >= order + 1 || b.kind !== 'time') b.order += 1;
      this.doc.buckets.push({ id: nid(), name, order: order + 1, budget: null, kind: 'time' });
    });
  }
  removeBucket(id: Id): void {
    const b = this.doc.buckets.find((x) => x.id === id);
    if (!b || b.kind !== 'time' || this.timeBuckets.length <= 1) return;
    const fallback = this.timeBuckets.find((x) => x.id !== id)!.id;
    this.commit('remove bucket', () => {
      for (const c of this.doc.cards) if (c.bucketId === id) c.bucketId = fallback;
      this.doc.buckets = this.doc.buckets.filter((x) => x.id !== id);
      if (this.doc.settings.defaultBucketId === id) this.doc.settings.defaultBucketId = fallback;
      if (this.doc.settings.lastDropBucketId === id) this.doc.settings.lastDropBucketId = null;
    });
  }
  moveBucket(id: Id, dir: -1 | 1): void {
    const tb = this.timeBuckets;
    const i = tb.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= tb.length) return;
    this.commit('reorder buckets', () => {
      const a = this.doc.buckets.find((b) => b.id === tb[i].id)!;
      const b = this.doc.buckets.find((x) => x.id === tb[j].id)!;
      [a.order, b.order] = [b.order, a.order];
    });
  }
  updateSettings(patch: Partial<Doc['settings']>): void {
    this.commit('settings', () => Object.assign(this.doc.settings, patch));
  }

  replaceDoc(doc: Doc): void {
    this.commit('import (replace)', () => (this.doc = doc));
    this.selectedId = null;
    this.focusStack = [];
  }
  mergeDoc(doc: Doc): void {
    const merged = mergeDocs($state.snapshot(this.doc) as Doc, doc);
    this.commit('import (merge)', () => (this.doc = merged));
  }

  // ---------- focus / selection ----------
  focus(id: Id): void {
    if (this.focusStack.includes(id)) this.focusStack = this.focusStack.slice(0, this.focusStack.indexOf(id) + 1);
    else this.focusStack = [...this.focusStack, id];
    this.selectedId = id;
    this.editingId = null;
  }
  popFocus(): void {
    this.focusStack = this.focusStack.slice(0, -1);
    this.selectedId = this.focusedId;
    this.editingId = null;
  }
  clearFocus(): void {
    this.focusStack = [];
    this.editingId = null;
  }
}

export const store = new Store();
