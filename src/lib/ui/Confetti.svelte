<script lang="ts">
  import { store } from '../model/store.svelte';

  /** A short burst of pixel confetti at the last pointer position when a card is completed. */
  interface Bit {
    id: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    color: string;
    rot: number;
  }
  let bits = $state<Bit[]>([]);
  let seq = 0;
  let last = { x: 0, y: 0 };
  const colors = ['#ff6b4a', '#4a9bff', '#f2b134', '#67c26b', '#2b2418', '#fff7c9'];

  function burst(x: number, y: number) {
    const fresh: Bit[] = [];
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 120;
      fresh.push({ id: ++seq, x, y, dx: Math.cos(a) * s, dy: Math.sin(a) * s - 60, color: colors[i % colors.length], rot: Math.random() * 360 });
    }
    bits = [...bits, ...fresh];
    setTimeout(() => (bits = bits.filter((b) => !fresh.includes(b))), 700);
  }

  $effect(() => {
    const id = store.lastCompletedId;
    if (!id) return;
    if (store.doc.settings.celebrate) burst(last.x, last.y);
    store.lastCompletedId = null;
  });
</script>

<svelte:window onpointermove={(e) => (last = { x: e.clientX, y: e.clientY })} onpointerdown={(e) => (last = { x: e.clientX, y: e.clientY })} />

{#each bits as b (b.id)}
  <span class="bit" style:left="{b.x}px" style:top="{b.y}px" style:--dx="{b.dx}px" style:--dy="{b.dy}px" style:--rot="{b.rot}deg" style:background={b.color}></span>
{/each}

<style>
  .bit {
    position: fixed;
    width: 7px;
    height: 7px;
    z-index: 200;
    pointer-events: none;
    animation: fly 650ms cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
  }
  @keyframes fly {
    0% {
      transform: translate(0, 0) rotate(0);
      opacity: 1;
    }
    100% {
      transform: translate(var(--dx), calc(var(--dy) + 90px)) rotate(var(--rot));
      opacity: 0;
    }
  }
</style>
