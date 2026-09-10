<script lang="ts">
  import { store } from '../model/store.svelte';

  /**
   * Yarn through a selected card's whole sub-todo tree. A sub-todo can be scheduled
   * into a different bucket than its parent, so the paths are drawn in viewport
   * space over the whole board rather than inside any one tray.
   */

  const DRAW_MS = 520;
  const STAGGER_MS = 110;

  interface Link {
    id: string;
    d: string;
    x: number;
    y: number;
    delay: number;
  }

  const edges = $derived(store.linkedEdges);
  /** The focus popup covers the board, so the lines behind it would just be noise. */
  const active = $derived(edges.length > 0 && store.focusStack.length === 0);

  let links = $state<Link[]>([]);

  function onBoard(id: string): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
    return [...all].find((el) => !el.closest('.stage')) ?? null;
  }

  /** Where a ray from the rect's centre toward (tx, ty) crosses its edge. */
  function edgePoint(r: DOMRect, tx: number, ty: number) {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const s = Math.min(dx ? r.width / 2 / Math.abs(dx) : Infinity, dy ? r.height / 2 / Math.abs(dy) : Infinity);
    return { x: cx + dx * s, y: cy + dy * s };
  }

  /** Two cubics meeting at a point pushed off the straight line, so the run reads as an S rather than a wire. */
  function snake(a: { x: number; y: number }, b: { x: number; y: number }, side: number): string {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const amp = Math.min(46, Math.max(16, len * 0.2)) * side;
    const mx = (a.x + b.x) / 2 - uy * amp;
    const my = (a.y + b.y) / 2 + ux * amp;
    const k = len * 0.24;
    return `M${a.x} ${a.y}C${a.x + ux * k} ${a.y + uy * k} ${mx - ux * k} ${my - uy * k} ${mx} ${my}S${b.x - ux * k} ${b.y - uy * k} ${b.x} ${b.y}`;
  }

  // Cards drag, trays resize and the masonry reflows underneath, so the geometry
  // is re-read each frame for as long as the lines are on screen.
  $effect(() => {
    if (!active) {
      links = [];
      return;
    }
    const tree = edges;
    let raf = requestAnimationFrame(function measure() {
      raf = requestAnimationFrame(measure);
      const next: Link[] = [];
      for (const e of tree) {
        const pEl = onBoard(e.parentId);
        const kEl = onBoard(e.childId);
        if (!pEl || !kEl) continue;
        const pr = pEl.getBoundingClientRect();
        const kr = kEl.getBoundingClientRect();
        const pc = { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 };
        const kc = { x: kr.left + kr.width / 2, y: kr.top + kr.height / 2 };
        const from = edgePoint(pr, kc.x, kc.y);
        const to = edgePoint(kr, pc.x, pc.y);
        // Each generation sets off as the one before it finishes drawing.
        next.push({ id: e.childId, d: snake(from, to, e.sib % 2 ? -1 : 1), x: to.x, y: to.y, delay: e.depth * DRAW_MS * 0.55 + e.sib * STAGGER_MS });
      }
      const unchanged = next.length === links.length && next.every((l, i) => links[i].id === l.id && links[i].d === l.d);
      if (!unchanged) links = next;
    });
    return () => cancelAnimationFrame(raf);
  });
</script>

{#if links.length}
  <svg class="links" aria-hidden="true" style:--draw="{DRAW_MS}ms">
    {#each links as l (l.id)}
      <g style:--delay="{l.delay}ms">
        <path class="thread shadow" d={l.d} pathLength="1" transform="translate(2 2)" />
        <path class="thread" d={l.d} pathLength="1" />
        <circle class="tip" cx={l.x} cy={l.y} r="4" />
      </g>
    {/each}
  </svg>
{/if}

<style>
  .links {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 4;
  }
  .thread {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: snake-out var(--draw) var(--ease-out) var(--delay) forwards;
  }
  .thread.shadow {
    stroke: var(--shadow);
    opacity: 0.35;
  }
  .tip {
    fill: var(--accent);
    stroke: var(--line);
    stroke-width: 1.5;
    scale: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: tip-in 220ms var(--ease-snap) calc(var(--delay) + var(--draw) * 0.85) forwards;
  }
  @keyframes snake-out {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes tip-in {
    to {
      scale: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .thread,
    .tip {
      animation-duration: 1ms;
      animation-delay: 0ms;
    }
  }
</style>
