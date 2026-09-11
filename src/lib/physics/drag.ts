/**
 * Pointer-driven drag. The element follows the pointer with a short spring lag
 * while held (a slightly "chunky" feel), and on release it lands exactly where
 * it was let go, with a small bounce. No coasting.
 *
 * While held the element carries data-drag="dragging", and for ~300ms after
 * release data-drag="dropped" (for a landing animation).
 *
 * The action only moves the element visually (via transform) and reports
 * positions in the parent's coordinate space; the caller owns the model and
 * decides what a drop means. The caller must update the model synchronously
 * inside `onRelease` so the DOM position and the cleared transform land in the
 * same paint.
 */

export interface DragEvents {
  /** Fired once pointer moved > threshold. Return false to cancel. */
  onStart?: (e: PointerEvent) => boolean | void;
  /** Live position of the element's top-left (parent coords) and the pointer event. */
  onMove?: (pos: { x: number; y: number }, e: PointerEvent) => void;
  /** Pointer released at `pos` (parent coords, where the element is right now). */
  onRelease?: (pos: { x: number; y: number }, e: PointerEvent) => void;
  onClick?: (e: PointerEvent) => void;
}

export interface DragOptions extends DragEvents {
  threshold?: number;
  /** Follow-spring stiffness while held; 1 = rigid. */
  follow?: number;
  enabled?: () => boolean;
  /** Ignore pointer-downs inside these selectors (inputs, buttons). */
  ignore?: string;
}

export function draggable(node: HTMLElement, opts: DragOptions) {
  let options = opts;
  let pointerId: number | null = null;
  let startClient = { x: 0, y: 0 };
  let startPos = { x: 0, y: 0 };
  let cur = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  let dragging = false;
  let raf = 0;
  let dropTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEvent: PointerEvent | null = null;
  let canDrag = true;

  const threshold = () => options.threshold ?? 3;
  const follow = () => options.follow ?? 0.6;

  function applyTransform() {
    node.style.transform = `translate(${cur.x - startPos.x}px, ${cur.y - startPos.y}px)`;
  }

  function followLoop() {
    if (!dragging) return;
    const k = follow();
    cur.x += (target.x - cur.x) * k;
    cur.y += (target.y - cur.y) * k;
    applyTransform();
    if (lastEvent) options.onMove?.({ ...cur }, lastEvent);
    raf = requestAnimationFrame(followLoop);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (options.ignore && (e.target as HTMLElement).closest(options.ignore)) return;
    // `enabled` only gates dragging; a plain click still reports through onClick.
    canDrag = !options.enabled || options.enabled();
    pointerId = e.pointerId;
    startClient = { x: e.clientX, y: e.clientY };
    startPos = { x: node.offsetLeft, y: node.offsetTop };
    cur = { ...startPos };
    target = { ...startPos };
    dragging = false;
    node.setPointerCapture(e.pointerId);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startClient.x;
    const dy = e.clientY - startClient.y;
    if (!dragging) {
      if (!canDrag || Math.hypot(dx, dy) < threshold()) return;
      if (options.onStart?.(e) === false) {
        cleanup();
        return;
      }
      dragging = true;
      if (dropTimer) clearTimeout(dropTimer);
      // A data attribute rather than a class: Svelte rewrites `class` on reactive
      // updates and would clobber anything added imperatively.
      node.dataset.drag = 'dragging';
      raf = requestAnimationFrame(followLoop);
    }
    lastEvent = e;
    target = { x: startPos.x + dx, y: startPos.y + dy };
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const wasDragging = dragging;
    cancelAnimationFrame(raf);
    cleanup();
    if (!wasDragging) {
      options.onClick?.(e);
      return;
    }
    // Land exactly where the pointer let go (not where the spring lag had us).
    cur = { ...target };
    applyTransform();
    node.dataset.drag = 'dropped';
    dropTimer = setTimeout(() => {
      if (node.dataset.drag === 'dropped') delete node.dataset.drag;
    }, 320);
    options.onRelease?.({ x: Math.round(cur.x), y: Math.round(cur.y) }, e);
    // The model has been updated synchronously above; clearing the transform
    // now means both changes paint together.
    node.style.transform = '';
  }

  function cleanup() {
    node.removeEventListener('pointermove', onPointerMove);
    node.removeEventListener('pointerup', onPointerUp);
    node.removeEventListener('pointercancel', onPointerUp);
    if (pointerId != null) {
      try {
        node.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    pointerId = null;
    dragging = false;
    lastEvent = null;
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.style.touchAction = 'none';

  return {
    update(next: DragOptions) {
      options = next;
    },
    destroy() {
      cancelAnimationFrame(raf);
      if (dropTimer) clearTimeout(dropTimer);
      cleanup();
      node.removeEventListener('pointerdown', onPointerDown);
    }
  };
}

/** Hit-test helper: which element under the pointer matches `selector`, ignoring `except`. */
export function elementUnder(e: { clientX: number; clientY: number }, selector: string, except?: HTMLElement): HTMLElement | null {
  const prev = except ? except.style.pointerEvents : '';
  if (except) except.style.pointerEvents = 'none';
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  if (except) except.style.pointerEvents = prev;
  return el?.closest(selector) as HTMLElement | null;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
