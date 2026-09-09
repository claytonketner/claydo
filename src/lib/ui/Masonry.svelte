<script lang="ts">
  import type { Bucket } from '../model/types';
  import Section from './Section.svelte';

  /**
   * Packs trays into columns, shortest column first, so short trays tuck under
   * each other instead of leaving grid gaps. Positions are absolute and animate.
   */
  let { buckets, filter = '', minCol = 330, gap = 14 }: { buckets: Bucket[]; filter?: string; minCol?: number; gap?: number } = $props();

  let width = $state(0);
  const heights = $state<Record<string, number>>({});

  const cols = $derived(Math.max(1, Math.floor((width + gap) / (minCol + gap))));
  const colW = $derived(cols > 0 ? (width - gap * (cols - 1)) / cols : width);
  const layout = $derived.by(() => {
    const tops = new Array<number>(cols).fill(0);
    const pos: Record<string, { x: number; y: number }> = {};
    for (const b of buckets) {
      let c = 0;
      for (let i = 1; i < cols; i++) if (tops[i] < tops[c] - 1) c = i;
      pos[b.id] = { x: c * (colW + gap), y: tops[c] };
      tops[c] += (heights[b.id] ?? 220) + gap;
    }
    return { pos, height: Math.max(0, ...tops) - gap };
  });

  function measure(node: HTMLElement, id: string) {
    const report = () => (heights[id] = node.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }
</script>

<div class="masonry" bind:clientWidth={width} style:height="{layout.height}px">
  {#each buckets as b (b.id)}
    <div class="cell" use:measure={b.id} style:left="{layout.pos[b.id]?.x ?? 0}px" style:top="{layout.pos[b.id]?.y ?? 0}px" style:width="{colW}px">
      <Section bucket={b} {filter} />
    </div>
  {/each}
</div>

<style>
  .masonry {
    position: relative;
    transition: height 240ms var(--ease-out);
  }
  .cell {
    position: absolute;
    transition:
      left 240ms var(--ease-out),
      top 240ms var(--ease-out),
      width 240ms var(--ease-out);
  }
</style>
