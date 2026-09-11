import { CARD_H, CARD_W } from '../model/types';
import { store } from '../model/store.svelte';
import { elementUnder, type Rect } from '../physics/drag';

/** Cards this close (px gap, or overlapping) "stick" together as a group. */
export const GROUP_GAP = 22;
/**
 * Nesting is accepted only while the pointer is inside a small square at the target's
 * centre: this is its ideal side in px. A square rather than an overlap fraction so a
 * big card is as easy to drop onto a small one as the other way round, and small so
 * there's a wide margin all round where you can park a card against a neighbour
 * (even partly on top of it) without nesting by accident.
 */
export const NEST_HIT = 44;
/** ...but the square never eats more than this fraction of the target's own width or height. */
const NEST_HIT_MAX = 0.4;

/** Half-width of the nest hit square at the centre of `r`. */
function nestReach(r: Rect): number {
  return Math.max(9, Math.min(NEST_HIT, r.width * NEST_HIT_MAX, r.height * NEST_HIT_MAX) / 2);
}
/** Breathing room the relayout keeps between cards that aren't grouped. */
const SPACING = 12;

/** Largest edge gap between two rects (0 when they overlap on both axes). */
export function gapBetween(a: Rect, b: Rect): number {
  const gx = Math.max(a.left, b.left) - Math.min(a.left + a.width, b.left + b.width);
  const gy = Math.max(a.top, b.top) - Math.min(a.top + a.height, b.top + b.height);
  return Math.max(0, gx, gy);
}

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
 *   matrix:<quadrant>    quick wins / big (life's work) / fill-ins / avoid (reconsider)
 */
export const dnd = $state({
  draggingId: null as string | null,
  /** Cluster the dragged card belongs to when the whole group is moving. */
  draggingClusterId: null as string | null,
  /** A group is possible here but ⇧ isn't held. */
  groupHint: false,
  /** Nearest card and how close the pointer is to its centre (0..1, 1 = dead centre). */
  overCardId: null as string | null,
  nestProgress: 0,
  intent: 'none' as Intent,
  overDropKey: null as string | null,
  /** Client rects for the overlay hull + label. */
  dragRect: null as Rect | null,
  targetRect: null as Rect | null,
  /** Popup is temporarily hidden so a nested card can be placed on the board. */
  peek: false
});

interface Follower {
  id: string;
  el: HTMLElement;
  start: { x: number; y: number };
}
/** Other members of the dragged card's group, moving along with it. */
let followers: Follower[] = [];
let anchorStart = { x: 0, y: 0 };
let anchorStartRect: Rect | null = null;

export function beginDrag(cardId: string, node: HTMLElement, opts: { alone?: boolean } = {}) {
  dnd.draggingId = cardId;
  dnd.groupHint = false;
  followers = [];
  const card = store.card(cardId);
  anchorStart = card ? { ...card.pos } : { x: 0, y: 0 };
  anchorStartRect = rectOf(node);
  dnd.draggingClusterId = null;
  if (card?.clusterId && !opts.alone && card.doneAt == null) {
    dnd.draggingClusterId = card.clusterId;
    for (const m of store.clusterMembers(card.clusterId)) {
      if (m.id === cardId || m.bucketId !== card.bucketId) continue;
      const el = [...document.querySelectorAll<HTMLElement>(`[data-card="${m.id}"]`)].find((x) => !x.closest('.stage'));
      if (!el) continue;
      el.dataset.drag = 'following';
      followers.push({ id: m.id, el, start: { ...m.pos } });
    }
  }
  dnd.overCardId = null;
  dnd.nestProgress = 0;
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
  if (followers.length && anchorStartRect) {
    const dx = me.left - anchorStartRect.left;
    const dy = me.top - anchorStartRect.top;
    for (const f of followers) f.el.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Candidates: cards whose centre square the pointer is in or approaching, plus
  // cards sitting close enough alongside to group with.
  interface Candidate {
    id: string;
    /** Pointer offset from the card's centre, as a multiple of the hit square (<= 1 is a nest). */
    reach: number;
    gap: number;
    rect: Rect;
  }
  const candidates: Candidate[] = [];
  const dragged = dnd.draggingId;
  for (const el of document.querySelectorAll<HTMLElement>('[data-card]')) {
    if (el === node || node.contains(el) || el.contains(node)) continue;
    if (dnd.peek && el.closest('.stage')) continue;
    if (!dnd.peek && document.querySelector('.stage') && !el.closest('.layer.top')) continue;
    const id = el.dataset.card!;
    if (!id || id === dragged) continue;
    if (followers.some((f) => f.id === id)) continue;
    const r = rectOf(el);
    const off = Math.max(Math.abs(e.clientX - (r.left + r.width / 2)), Math.abs(e.clientY - (r.top + r.height / 2)));
    const reach = off / nestReach(r);
    const gap = gapBetween(me, r);
    if (reach > 1 && gap > GROUP_GAP) continue;
    candidates.push({ id, reach, gap, rect: r });
  }
  // A card whose hit square the pointer is in wins over any merely adjacent one;
  // ties on either side go to whichever centre the pointer is nearest.
  candidates.sort((a, b) => {
    const aIn = a.reach <= 1;
    const bIn = b.reach <= 1;
    if (aIn !== bIn) return aIn ? -1 : 1;
    if (!aIn && a.gap !== b.gap) return a.gap - b.gap;
    return a.reach - b.reach;
  });
  const best = candidates[0] ?? null;

  const can = best && dragged ? capabilities(dragged, best.id) : null;
  let intent: Intent = 'none';
  let hint = false;
  if (best && can && !e.altKey) {
    const targetIsPerson = store.card(best.id)?.kind === 'person';
    if (can.nest && (best.reach <= 1 || targetIsPerson)) intent = 'nest';
    else if (can.group && best.gap <= GROUP_GAP && e.shiftKey) intent = 'group';
    else if (can.group && best.gap <= GROUP_GAP) hint = true;
  }
  dnd.groupHint = hint;
  dnd.overCardId = intent === 'none' && !hint ? null : best!.id;
  // Full once inside the square, fading out over a square twice its size.
  dnd.nestProgress = best ? Math.max(0, Math.min(1, 2 - best.reach)) : 0;
  dnd.targetRect = intent === 'none' && !hint ? null : best!.rect;
  dnd.intent = intent;

  const dropEl = elementUnder(e, '[data-drop]', node);
  dnd.overDropKey = dropEl?.dataset.drop ?? null;
}

export function endDrag() {
  for (const f of followers) {
    f.el.style.transform = '';
    if (f.el.dataset.drag === 'following') delete f.el.dataset.drag;
  }
  followers = [];
  dnd.draggingClusterId = null;
  dnd.groupHint = false;
  dnd.draggingId = null;
  dnd.overCardId = null;
  dnd.nestProgress = 0;
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
  // Groups are for peers on the same tray (both top-level with explicit buckets, not done),
  // and people only group with people.
  const group =
    child.doneAt == null && target.doneAt == null && !!child.bucketId && !!target.bucketId && (child.kind === 'person') === (target.kind === 'person');
  return { nest, group };
}

/**
 * Resolve a drop. The caller passes the release position in its parent's
 * coordinates; for a same-container release we store it as the card's spot.
 */
export function resolveDrop(cardId: string, node: HTMLElement, pos: { x: number; y: number }, e: PointerEvent, ctx: { currentDropKey: string | null; free: boolean }): void {
  const before = store.card(cardId);
  const bucketBefore = before?.bucketId ?? null;
  const parentBefore = before?.parentId ?? null;
  resolveAnchor(cardId, node, pos, e, ctx);
  const after = store.card(cardId);
  // The rest of the group comes along if the anchor simply moved (same or different tray).
  if (followers.length && after && after.doneAt == null && after.parentId === parentBefore && after.bucketId) {
    const dx = after.pos.x - anchorStart.x;
    const dy = after.pos.y - anchorStart.y;
    const moves: { id: string; pos: { x: number; y: number } }[] = [];
    for (const f of followers) {
      const target = { x: f.start.x + dx, y: f.start.y + dy };
      if (after.bucketId === bucketBefore) moves.push({ id: f.id, pos: target });
      else store.moveToBucket(f.id, after.bucketId, target);
    }
    if (moves.length) store.setPositions(moves);
    if (after.bucketId !== bucketBefore) {
      // moveToBucket drops cluster membership on a tray change; re-form the group.
      for (const f of followers) store.group(f.id, cardId);
    }
  }
  if (pendingRelayout) {
    const b = pendingRelayout;
    pendingRelayout = null;
    relayoutTray(b, cardId);
  }
}

let pendingRelayout: string | null = null;

function resolveAnchor(cardId: string, node: HTMLElement, pos: { x: number; y: number }, e: PointerEvent, ctx: { currentDropKey: string | null; free: boolean }): void {
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
        pendingRelayout = bucketId;
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
    // A sub-todo inheriting its parent's bucket has no bucketId of its own, but it still sits on that tray.
    if (ctx.free && card.doneAt == null) pendingRelayout = store.bucketOf(card)?.id ?? null;
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
      if (bucket.kind === 'people' && card.kind !== 'person') {
        store.showToast('Drop it on a person to add it to their agenda');
        return;
      }
      const trayEl = elementUnder(e, `[data-drop="${key}"]`, node);
      // Inside a popup the mini-trays aren't the board, so let the store pick a free spot.
      const rel = trayEl && !trayEl.closest('.stage') ? relativePos(node, trayEl) : undefined;
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
      if (rel) pendingRelayout = val;
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
  if (card.clusterId && !followers.length) {
    const me = document.querySelector<HTMLElement>(`[data-card="${cardId}"]`);
    if (!me) return;
    const mine = rectOf(me);
    const stillClose = store
      .clusterMembers(card.clusterId)
      .filter((m) => m.id !== cardId)
      .some((m) => {
        const el = document.querySelector<HTMLElement>(`[data-card="${m.id}"]`);
        return el && gapBetween(mine, rectOf(el)) <= GROUP_GAP * 2;
      });
    if (!stillClose) store.ungroup(cardId);
  }
}

/**
 * After a drop, nudge the other cards on the tray so nothing sits on top of
 * anything else (with a little spacing), while grouped cards move as one
 * rigid body and the dropped card stays exactly where it was put.
 */
export function relayoutTray(bucketId: string, anchorId: string): void {
  const trayEl = [...document.querySelectorAll<HTMLElement>(`[data-drop="bucket:${bucketId}"]`)].find((el) => !el.closest('.stage'));
  if (!trayEl) return;
  const trayW = trayEl.clientWidth;
  const maxX = Math.max(0, trayW - CARD_W - 8);
  const cards = store.cardsInBucket(bucketId).filter((c) => c.doneAt == null);
  if (cards.length < 2) return;

  interface Body {
    ids: string[];
    x: number;
    y: number;
    w: number;
    h: number;
    fixed: boolean;
    offsets: { id: string; dx: number; dy: number }[];
  }
  const hOf = (id: string) => store.cardHeights[id] ?? CARD_H;
  const byCluster = new Map<string, typeof cards>();
  const singles: typeof cards = [];
  for (const c of cards) {
    if (c.clusterId) byCluster.set(c.clusterId, [...(byCluster.get(c.clusterId) ?? []), c]);
    else singles.push(c);
  }
  const bodies: Body[] = [];
  const mk = (members: typeof cards) => {
    const x0 = Math.min(...members.map((m) => Math.min(m.pos.x, maxX)));
    const y0 = Math.min(...members.map((m) => m.pos.y));
    const x1 = Math.max(...members.map((m) => Math.min(m.pos.x, maxX) + CARD_W));
    const y1 = Math.max(...members.map((m) => m.pos.y + hOf(m.id)));
    bodies.push({
      ids: members.map((m) => m.id),
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      fixed: members.some((m) => m.id === anchorId),
      offsets: members.map((m) => ({ id: m.id, dx: Math.min(m.pos.x, maxX) - x0, dy: m.pos.y - y0 }))
    });
  };
  for (const members of byCluster.values()) members.length > 1 ? mk(members) : singles.push(...members);
  for (const c of singles) mk([c]);

  // Greedy: keep the dropped body where it is, then settle the others nearest-first,
  // each to the closest free spot to where it already was. No oscillation, and bodies
  // that weren't in the way don't move at all.
  const maxBodyX = (b: Body) => Math.max(0, trayW - 8 - b.w);
  const collides = (b: Body, x: number, y: number, placed: Body[]) =>
    placed.some((p) => Math.min(x + b.w, p.x + p.w) - Math.max(x, p.x) + SPACING > 0 && Math.min(y + b.h, p.y + p.h) - Math.max(y, p.y) + SPACING > 0);
  const anchor = bodies.find((b) => b.fixed);
  if (!anchor) return;
  const ax = anchor.x + anchor.w / 2;
  const ay = anchor.y + anchor.h / 2;
  const placed: Body[] = [anchor];
  const rest = bodies.filter((b) => !b.fixed).sort((p, q) => Math.hypot(p.x + p.w / 2 - ax, p.y + p.h / 2 - ay) - Math.hypot(q.x + q.w / 2 - ax, q.y + q.h / 2 - ay));
  const dirs: [number, number][] = [];
  for (let i = 0; i < 16; i++) dirs.push([Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)]);
  for (const b of rest) {
    const ox = Math.min(maxBodyX(b), Math.max(0, b.x));
    const oy = Math.max(0, b.y);
    if (!collides(b, ox, oy, placed)) {
      b.x = ox;
      b.y = oy;
      placed.push(b);
      continue;
    }
    let found = false;
    for (let r = 8; r <= 900 && !found; r += 8) {
      for (const [dx, dy] of dirs) {
        const x = Math.min(maxBodyX(b), Math.max(0, ox + dx * r));
        const y = Math.max(0, oy + dy * r);
        if (!collides(b, x, y, placed)) {
          b.x = x;
          b.y = y;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      // Worst case: drop it below everything.
      b.x = ox;
      b.y = Math.max(...placed.map((p) => p.y + p.h)) + SPACING;
    }
    placed.push(b);
  }

  const changes: { id: string; pos: { x: number; y: number } }[] = [];
  for (const body of bodies) {
    if (body.fixed) continue;
    for (const o of body.offsets) changes.push({ id: o.id, pos: { x: Math.round(body.x + o.dx), y: Math.round(body.y + o.dy) } });
  }
  store.setPositions(changes);
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
