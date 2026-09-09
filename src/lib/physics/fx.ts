/**
 * Card flight: when a card changes trays (finished, reopened, undone), animate a
 * clone from where it was to where it now is, so the move reads as motion
 * rather than a teleport. DOM-only; the store calls these around a mutation.
 */

export type RectMap = Map<string, DOMRect>;

function boardCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-card]')].filter((el) => !el.closest('.stage'));
}

/** Where every board card is right now. */
export function captureRects(): RectMap {
  const m: RectMap = new Map();
  if (typeof document === 'undefined') return m;
  for (const el of boardCards()) m.set(el.dataset.card!, el.getBoundingClientRect());
  return m;
}

export function centerOf(r: DOMRect | undefined): { x: number; y: number } | null {
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

/**
 * After the DOM has updated, fly any card that moved a meaningful distance from
 * its captured rect to its new one. Call after `await tick()`.
 */
export function flyFrom(prev: RectMap, opts: { max?: number; duration?: number } = {}): void {
  if (typeof document === 'undefined') return;
  const max = opts.max ?? 12;
  const duration = opts.duration ?? 560;
  let n = 0;
  for (const el of boardCards()) {
    if (n >= max) break;
    const id = el.dataset.card!;
    const from = prev.get(id);
    if (!from) continue;
    const to = el.getBoundingClientRect();
    if (Math.hypot(to.left - from.left, to.top - from.top) < 8) continue;
    n++;
    fly(el, from, to, duration);
  }
}

function fly(el: HTMLElement, from: DOMRect, to: DOMRect, duration: number): void {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-card');
  clone.style.position = 'fixed';
  clone.style.left = `${from.left}px`;
  clone.style.top = `${from.top}px`;
  clone.style.width = `${from.width}px`;
  clone.style.height = `${from.height}px`;
  clone.style.margin = '0';
  clone.style.zIndex = '150';
  clone.style.pointerEvents = 'none';
  clone.style.transition = 'none';
  clone.style.animation = 'none';
  clone.style.maxHeight = 'none';
  document.body.appendChild(clone);
  el.style.visibility = 'hidden';

  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const sx = to.width / Math.max(1, from.width);
  const sy = to.height / Math.max(1, from.height);
  // Arc a little: lift up first, then swoop to the target.
  const lift = Math.min(80, Math.abs(dy) * 0.25 + 20);
  const anim = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', offset: 0 },
      { transform: `translate(${dx * 0.3}px, ${-lift}px) scale(1.04) rotate(-4deg)`, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)`, offset: 1 }
    ],
    { duration, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' }
  );
  const done = () => {
    clone.remove();
    el.style.visibility = '';
  };
  anim.onfinish = done;
  anim.oncancel = done;
  setTimeout(done, duration + 200);
}
