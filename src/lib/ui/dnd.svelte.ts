import { CARD_W } from '../model/types';
import { store } from '../model/store.svelte';
import type { DragBounds } from '../physics/drag';
import { elementUnder } from '../physics/drag';

/**
 * Shared drag state so trays and cards can highlight as drop targets.
 * Drop keys (on `data-drop` attributes):
 *   bucket:<id>          move to a bucket tray
 *   inherit              child inherits parent bucket (focus mode)
 *   effort:<1-5>|none    set effort
 *   value:<1-3>|none     set value
 *   person:<id>|none     add / clear person
 *   tag:<tag>|none       add / clear tags
 *   age:touch            reset staleness
 *   matrix:<quadrant>    quick wins / big bets / fill-ins / avoid
 */
export const dnd = $state({
  draggingId: null as string | null,
  overCardId: null as string | null,
  overDropKey: null as string | null,
  nestIntent: false
});

export function beginDrag(cardId: string) {
  dnd.draggingId = cardId;
  dnd.overCardId = null;
  dnd.overDropKey = null;
  dnd.nestIntent = false;
}

export function trackDrag(e: PointerEvent, node: HTMLElement) {
  const cardEl = elementUnder(e, '[data-card]', node);
  const cardId = cardEl?.dataset.card ?? null;
  const dropEl = elementUnder(e, '[data-drop]', node);
  const canNest = cardId && dnd.draggingId && cardId !== dnd.draggingId && !e.altKey && canNestInto(dnd.draggingId, cardId);
  dnd.overCardId = canNest ? cardId : null;
  dnd.nestIntent = !!canNest;
  dnd.overDropKey = dropEl?.dataset.drop ?? null;
}

export function endDrag() {
  dnd.draggingId = null;
  dnd.overCardId = null;
  dnd.overDropKey = null;
  dnd.nestIntent = false;
}

function canNestInto(childId: string, parentId: string): boolean {
  const child = store.card(childId);
  const parent = store.card(parentId);
  if (!child || !parent) return false;
  if (child.kind === 'person') return false;
  if (store.isDescendant(parentId, childId)) return false;
  return true;
}

/**
 * Resolve a drop. Returns coast bounds when the card should keep its free
 * position (same tray), or null when the model moved it somewhere else.
 */
export function resolveDrop(
  cardId: string,
  node: HTMLElement,
  e: PointerEvent,
  ctx: { currentDropKey: string | null; free: boolean }
): DragBounds | null {
  const card = store.card(cardId);
  if (!card) return null;

  // 1. Nest onto another card
  if (dnd.nestIntent && dnd.overCardId) {
    const parent = store.card(dnd.overCardId);
    if (store.nest(cardId, dnd.overCardId)) {
      store.showToast(`Nested under "${parent?.title || 'card'}"`, () => store.undo());
      return null;
    }
  }

  const key = dnd.overDropKey;
  if (!key) {
    return ctx.free ? boundsFor(node) : null;
  }

  // 2. Same tray: keep free position, let it coast
  if (key === ctx.currentDropKey) {
    return ctx.free ? boundsFor(node) : null;
  }

  const [type, ...rest] = key.split(':');
  const val = rest.join(':');
  switch (type) {
    case 'bucket': {
      const trayEl = elementUnder(e, `[data-drop="${key}"]`, node);
      const pos = trayEl ? relativePos(node, trayEl) : undefined;
      if (card.parentId && card.bucketId == null) {
        // child leaving "inherit": give it its own bucket, keep it nested
        store.updateCard(cardId, { bucketId: val, pos: pos ?? store.freeSpot(val, cardId) }, { label: 'schedule child' });
      } else {
        store.moveToBucket(cardId, val, pos);
      }
      return null;
    }
    case 'inherit': {
      if (card.parentId) store.updateCard(cardId, { bucketId: null }, { label: 'inherit bucket' });
      return null;
    }
    case 'effort':
      store.updateCard(cardId, { effort: val === 'none' ? null : (Number(val) as 1 | 2 | 3 | 4 | 5) }, { label: 'set effort' });
      return null;
    case 'value':
      store.updateCard(cardId, { value: val === 'none' ? null : (Number(val) as 1 | 2 | 3) }, { label: 'set value' });
      return null;
    case 'person':
      if (val === 'none') store.updateCard(cardId, { peopleIds: [] }, { label: 'clear people' });
      else if (!card.peopleIds.includes(val)) store.updateCard(cardId, { peopleIds: [...card.peopleIds, val] }, { label: 'add person' });
      return null;
    case 'tag':
      if (val === 'none') store.updateCard(cardId, { tags: [] }, { label: 'clear tags' });
      else if (!card.tags.includes(val)) store.updateCard(cardId, { tags: [...card.tags, val] }, { label: 'add tag' });
      return null;
    case 'age':
      store.updateCard(cardId, {}, { label: 'touch' });
      store.showToast('Freshened up');
      return null;
    case 'matrix': {
      const presets: Record<string, { effort: 1 | 2 | 3 | 4 | 5; value: 1 | 2 | 3 }> = {
        quick: { effort: 2, value: 3 },
        big: { effort: 4, value: 3 },
        fill: { effort: 2, value: 1 },
        avoid: { effort: 4, value: 1 }
      };
      const p = presets[val];
      if (p) {
        const lowE = (card.effort ?? 3) <= 2;
        const highV = (card.value ?? 2) >= 3;
        const patch: Partial<typeof card> = {};
        if ((val === 'quick' || val === 'fill') !== lowE) patch.effort = p.effort;
        if ((val === 'quick' || val === 'big') !== highV) patch.value = p.value;
        if (card.effort == null) patch.effort = p.effort;
        if (card.value == null) patch.value = p.value;
        store.updateCard(cardId, patch, { label: 'set quadrant' });
      }
      return null;
    }
    default:
      return ctx.free ? boundsFor(node) : null;
  }
}

function boundsFor(node: HTMLElement): DragBounds {
  const parent = node.offsetParent as HTMLElement | null;
  const w = parent?.clientWidth ?? 800;
  return { minX: 0, minY: 0, maxX: Math.max(0, w - CARD_W - 8), maxY: 100000 };
}

function relativePos(node: HTMLElement, tray: HTMLElement): { x: number; y: number } {
  const n = node.getBoundingClientRect();
  const t = tray.getBoundingClientRect();
  const maxX = Math.max(0, tray.clientWidth - CARD_W - 8);
  return {
    x: Math.min(maxX, Math.max(0, n.left - t.left)),
    y: Math.max(0, n.top - t.top)
  };
}
