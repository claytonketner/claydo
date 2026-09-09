/**
 * Pointer-driven drag with a light physics feel:
 *  - the element follows the pointer with a short spring lag while held
 *  - velocity is sampled over the last ~80ms
 *  - on release it coasts with strong friction and settles, bouncing softly
 *    off the bounds the caller supplies.
 *
 * The action reports positions in the parent's coordinate space; the caller
 * owns the model and decides what a drop means.
 */

export interface DragBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DragEvents {
  /** Fired once pointer moved > threshold. Return false to cancel. */
  onStart?: (e: PointerEvent) => boolean | void;
  /** Live position of the element's top-left (parent coords) and the pointer (client coords). */
  onMove?: (pos: { x: number; y: number }, e: PointerEvent) => void;
  /** Pointer released. `pos` is where the element is right now; `velocity` in px/s. */
  onRelease?: (pos: { x: number; y: number }, velocity: { vx: number; vy: number }, e: PointerEvent) => DragBounds | null | void;
  /** After the coast/settle animation finishes. */
  onSettle?: (pos: { x: number; y: number }) => void;
  /** Per animation frame while coasting, so the caller can update the model. */
  onCoast?: (pos: { x: number; y: number }) => void;
  onClick?: (e: PointerEvent) => void;
}

export interface DragOptions extends DragEvents {
  threshold?: number;
  /** Stiffness of the follow spring while held; 1 = rigid. */
  follow?: number;
  friction?: number;
  bounce?: number;
  enabled?: () => boolean;
  /** Ignore drags starting inside these selectors (inputs, buttons). */
  ignore?: string;
}

interface Sample {
  t: number;
  x: number;
  y: number;
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
  let samples: Sample[] = [];
  let lastEvent: PointerEvent | null = null;

  const threshold = () => options.threshold ?? 3;
  const follow = () => options.follow ?? 0.55;
  const friction = () => options.friction ?? 0.82;
  const bounce = () => options.bounce ?? 0.35;

  function currentPos(): { x: number; y: number } {
    return { x: node.offsetLeft, y: node.offsetTop };
  }

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
    if (options.enabled && !options.enabled()) return;
    if (options.ignore && (e.target as HTMLElement).closest(options.ignore)) return;
    pointerId = e.pointerId;
    startClient = { x: e.clientX, y: e.clientY };
    startPos = currentPos();
    cur = { ...startPos };
    target = { ...startPos };
    samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
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
      if (Math.hypot(dx, dy) < threshold()) return;
      if (options.onStart?.(e) === false) {
        cleanup();
        return;
      }
      dragging = true;
      node.classList.add('dragging');
      raf = requestAnimationFrame(followLoop);
    }
    lastEvent = e;
    target = { x: startPos.x + dx, y: startPos.y + dy };
    const now = performance.now();
    samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (samples.length > 2 && now - samples[0].t > 80) samples.shift();
  }

  function velocity(): { vx: number; vy: number } {
    if (samples.length < 2) return { vx: 0, vy: 0 };
    const a = samples[0];
    const b = samples[samples.length - 1];
    const dt = Math.max(1, b.t - a.t) / 1000;
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
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
    node.classList.remove('dragging');
    // snap to pointer target before release so the release position is truthful
    cur = { ...target };
    applyTransform();
    const v = velocity();
    const bounds = options.onRelease?.({ ...cur }, v, e);
    if (bounds === null || bounds === undefined) {
      node.style.transform = '';
      options.onSettle?.({ ...cur });
      return;
    }
    coast(v, bounds);
  }

  function coast(v: { vx: number; vy: number }, bounds: DragBounds) {
    // Convert px/s to px/frame at ~60fps and cap the fling so it stays snappy.
    const cap = 1400;
    let vx = Math.max(-cap, Math.min(cap, v.vx)) / 60;
    let vy = Math.max(-cap, Math.min(cap, v.vy)) / 60;
    const f = friction();
    const b = bounce();
    node.classList.add('coasting');
    const step = () => {
      vx *= f;
      vy *= f;
      cur.x += vx;
      cur.y += vy;
      if (cur.x < bounds.minX) {
        cur.x = bounds.minX;
        vx = -vx * b;
      } else if (cur.x > bounds.maxX) {
        cur.x = bounds.maxX;
        vx = -vx * b;
      }
      if (cur.y < bounds.minY) {
        cur.y = bounds.minY;
        vy = -vy * b;
      } else if (cur.y > bounds.maxY) {
        cur.y = bounds.maxY;
        vy = -vy * b;
      }
      applyTransform();
      options.onCoast?.({ ...cur });
      if (Math.abs(vx) > 0.15 || Math.abs(vy) > 0.15) {
        raf = requestAnimationFrame(step);
      } else {
        node.classList.remove('coasting');
        node.style.transform = '';
        options.onSettle?.({ x: Math.round(cur.x), y: Math.round(cur.y) });
      }
    };
    raf = requestAnimationFrame(step);
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
