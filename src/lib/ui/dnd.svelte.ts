import { CARD_W } from '../model/types';
import { store } from '../model/store.svelte';
import { elementUnder, overlapRatio, type Rect } from '../physics/drag';

/** Overlap (fraction of the dragged card) at which the two start to "stick" as a group. */
export const GROUP_T = 0.12;
/** Overlap at which dropping nests instead. */
export const NEST_T = 0.55;

export type Intent = 'none' | 'group' | 'nest';

/**
 * Shared drag state so trays, cards and the overlay can react.
 * Drop keys (on `data-drop` attributes):
 *   bucket:<id>          a bucket tray (done tray completes the card)
 *   inherit              child inherits parent bucket (popup)
 *   effort:<1-5>|none    set effort
 *   value:<1-3>|none     set value
 *   person:<id>|none     add / clear person
 *   tag:<tag>|none       add / clear tags
 *   matrix:<quadrant>    quick wins / big bets / fill-ins / avoid
 */
export const dnd = $state({
  draggingId: null as string | null,
  /** Nearest overlapping card and how much of the dragged card it covers. */
  overCardId: null as string | null,
  overlap: 0,
  intent: 'none' as Intent,
  overDropKey: null as string | null,
  /** Client rects for the overlay hull + label. */
  dragRect: null as Rect | null,
  targetRect: null as Rect | null,
  /** Popup is temporarily hidden so a nested card can be placed on the board. */
  peek: false
});

export function beginDrag(cardId: string) {
  dnd.draggingId = cardId;
  dnd.overCardId = null;
  dnd.overlap = 0;
  dnd.intent = 'none';
  dnd.overDropKey = null;
  dnd.dragRect = null;
  dnd.targetRect = null;
  dnd.peek = false;
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function trackDrag(e: PointerEvent, node: HTMLElement) {
  const me = rectOf(node);
  dnd.dragRect = me;

  // Nearest overlapping card (by area), among visible cards that aren't us or our descendants.
  let best: { id: string; ratio: number; rect: Rect } | null = null;
  const dragged = dnd.draggingId;
  for (const el of document.querySelectorAll<HTMLElement>('[data-card]')) {
    if (el === node || node.contains(el) || el.contains(node)) continue;
    if (dnd.peek && el.closest('.stage')) continue;
    if (!dnd.peek && document.querySelector('.stage') && !el.closest('.layer.top')) continue;
    const id = el.dataset.card!;
    if (!id || id === dragged) continue;
    const r = rectOf(el);
    const ratio = overlapRatio(me, r);
    if (ratio > 0 && (!best || ratio > best.ratio)) best = { id, ratio, rect: r };
  }

  const can = best && dragged ? capabilities(dragged, best.id) : null;
  let intent: Intent = 'none';
  if (best && can && !e.altKey) {
    if (best.ratio >= NEST_T && can.nest) intent = 'nest';
    else if (best.ratio >= GROUP_T && (can.group || can.nest)) intent = 'group';
  }
  dnd.overCardId = intent === 'none' ? null : best!.id;
  dnd.overlap = best ? best.ratio : 0;
  dnd.targetRect = intent === 'none' ? null : best!.rect;
  dnd.intent = intent;

  const dropEl = elementUnder(e, '[data-drop]', node);
  dnd.overDropKey = dropEl?.dataset.drop ?? null;
}

export function endDrag() {
  dnd.draggingId = null;
  dnd.overCardId = null;
  dnd.overlap = 0;
  dnd.intent = 'none';
  dnd.overDropKey = null;
  dnd.dragRect = null;
  dnd.targetRect = null;
  dnd.peek = false;
}

function capabilities(childId: string, targetId: string): { nest: boolean; group: boolean } {
  const child = store.card(childId);
  const target = store.card(targetId);
  if (!child || !target) return { nest: false, group: false };
  const nest = child.kind !== 'person' && child.doneAt == null && target.doneAt == null && !store.isDescendant(targetId, childId);
  // Groups are for peers on the same tray (both top-level with explicit buckets, not done).
  const group = child.doneAt == null && target.doneAt == null && !!child.bucketId && !!target.bucketId;
  return { nest, group };
}

/**
 * Resolve a drop. The caller passes the release position in its parent's
 * coordinates; for a same-container release we store it as the card's spot.
 */
export function resolveDrop(cardId: string, node: HTMLElement, pos: { x: number; y: number }, e: PointerEvent, ctx: { currentDropKey: string | null; free: boolean }): void {
  const card = store.card(cardId);
  if (!card) return;
  const key = dnd.overDropKey;
  const peek = dnd.peek;
  const target = dnd.overCardId ? store.card(dnd.overCardId) : null;

  // 1. Nest onto another card
  if (dnd.intent === 'nest' && target) {
    if (store.nest(cardId, target.id)) {
      store.showToast(`Nested under "${target.title || 'card'}"`, () => store.undo());
      store.focus(target.id);
      return;
    }
  }

  // 2. Un-nesting from the popup while peeking at the board. Once the popup has
  //    stepped aside it stays closed whatever happens.
  if (peek) {
    if (key?.startsWith('bucket:')) {
      const bucketId = key.slice(7);
      const bucket = store.doc.buckets.find((b) => b.id === bucketId);
      if (bucket && bucket.kind !== 'done' && bucket.kind !== 'people') {
        const trayEl = elementUnder(e, `[data-drop="${key}"]`, node);
        store.unnestTo(cardId, bucketId, trayEl ? relativePos(node, trayEl) : undefined);
        store.showToast('Pulled out onto the board', () => store.undo());
      }
    }
    store.clearFocus();
    return;
  }

  // 3. Same container: keep the free position where it was let go
  const sameTray = !key || key === ctx.currentDropKey;
  if (sameTray) {
    if (ctx.free) {
      const maxX = maxXFor(node);
      const p = { x: Math.min(maxX, Math.max(0, pos.x)), y: Math.max(0, pos.y) };
      store.setPos(cardId, card.doneAt != null ? { x: p.x, y: 0 } : p);
    }
    settleGrouping(cardId, target, dnd.intent);
    return;
  }

  const [type, ...rest] = key!.split(':');
  const val = rest.join(':');
  switch (type) {
    case 'bucket': {
      const bucket = store.doc.buckets.find((b) => b.id === val);
      if (!bucket) return;
      if (bucket.kind === 'done') {
        store.requestComplete(cardId);
        return;
      }
      const trayEl = elementUnder(e, `[data-drop="${key}"]`, node);
      const rel = trayEl ? relativePos(node, trayEl) : undefined;
      if (card.doneAt != null) {
        store.reopen(cardId);
        store.moveToBucket(cardId, val, rel);
      } else if (card.parentId && card.bucketId == null) {
        // child leaving "inherit" inside the popup: give it its own bucket, keep it nested
        store.updateCard(cardId, { bucketId: val, pos: rel ?? store.freeSpot(val, cardId), kind: bucket.kind === 'ideas' ? 'idea' : card.kind === 'idea' && bucket.kind === 'time' ? 'todo' : card.kind }, { label: 'schedule child' });
      } else {
        store.moveToBucket(cardId, val, rel);
      }
      settleGrouping(cardId, target, dnd.intent);
      return;
    }
    case 'inherit':
      if (card.parentId) store.updateCard(cardId, { bucketId: null }, { label: 'inherit bucket' });
      return;
    case 'effort':
      store.updateCard(cardId, { effort: val === 'none' ? null : (Number(val) as 1 | 2 | 3 | 4 | 5) }, { label: 'set effort' });
      return;
    case 'value':
      store.updateCard(cardId, { value: val === 'none' ? null : (Number(val) as 1 | 2 | 3) }, { label: 'set value' });
      return;
    case 'person':
      if (val === 'none') store.updateCard(cardId, { peopleIds: [] }, { label: 'clear people' });
      else if (!card.peopleIds.includes(val)) store.updateCard(cardId, { peopleIds: [...card.peopleIds, val] }, { label: 'add person' });
      return;
    case 'tag':
      if (val === 'none') store.updateCard(cardId, { tags: [] }, { label: 'clear tags' });
      else if (!card.tags.includes(val)) store.updateCard(cardId, { tags: [...card.tags, val] }, { label: 'add tag' });
      return;
    case 'matrix': {
      const presets: Record<string, { effort: 1 | 2 | 3 | 4 | 5; value: 1 | 2 | 3 }> = {
        quick: { effort: 2, value: 3 },
        big: { effort: 4, value: 3 },
        fill: { effort: 2, value: 1 },
        avoid: { effort: 4, value: 1 }
      };
      const p = presets[val];
      if (!p) return;
      const lowE = (card.effort ?? 3) <= 2;
      const highV = (card.value ?? 2) >= 3;
      const patch: Partial<typeof card> = {};
      if ((val === 'quick' || val === 'fill') !== lowE || card.effort == null) patch.effort = p.effort;
      if ((val === 'quick' || val === 'big') !== highV || card.value == null) patch.value = p.value;
      store.updateCard(cardId, patch, { label: 'set quadrant' });
      return;
    }
  }
}

/** After a drop: join the target's group, or leave our group if we've moved away from all its members. */
function settleGrouping(cardId: string, target: ReturnType<typeof store.card>, intent: Intent) {
  const card = store.card(cardId);
  if (!card) return;
  if (intent === 'group' && target && target.bucketId === card.bucketId && card.doneAt == null) {
    if (card.clusterId !== target.clusterId || !card.clusterId) {
      store.group(cardId, target.id);
      store.showToast(`Grouped with "${target.title || 'card'}"`, () => store.undo());
    }
    return;
  }
  if (card.clusterId) {
    const me = document.querySelector<HTMLElement>(`[data-card="${cardId}"]`);
    if (!me) return;
    const mine = rectOf(me);
    const stillTouching = store
      .clusterMembers(card.clusterId)
      .filter((m) => m.id !== cardId)
      .some((m) => {
        const el = document.querySelector<HTMLElement>(`[data-card="${m.id}"]`);
        return el && overlapRatio(mine, rectOf(el)) > 0.02;
      });
    if (!stillTouching) store.ungroup(cardId);
  }
}

function maxXFor(node: HTMLElement): number {
  const parent = node.offsetParent as HTMLElement | null;
  return Math.max(0, (parent?.clientWidth ?? 800) - CARD_W - 8);
}

function relativePos(node: HTMLElement, tray: HTMLElement): { x: number; y: number } {
  const n = node.getBoundingClientRect();
  const t = tray.getBoundingClientRect();
  const maxX = Math.max(0, tray.clientWidth - CARD_W - 8);
  return {
    x: Math.min(maxX, Math.max(0, Math.round(n.left - t.left))),
    y: Math.max(0, Math.round(n.top - t.top))
  };
}
