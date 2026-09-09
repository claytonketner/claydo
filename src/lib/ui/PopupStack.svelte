<script lang="ts">
  import { store } from '../model/store.svelte';
  import CardPopup from './CardPopup.svelte';
  import { dnd } from './dnd.svelte';

  /**
   * One layer per open popup. Lower layers sit behind the top one, offset and
   * slightly rotated like cards tossed on a desk; when the top closes, the next
   * one straightens up. Clicking the backdrop closes them all.
   */
  const stack = $derived(store.focusStack);

  let stageEl = $state<HTMLElement | null>(null);
  let peekTimer: ReturnType<typeof setTimeout> | null = null;

  // Drag-out: hold a card outside the top popup for a moment and the whole stack steps aside.
  function onWindowMove(e: PointerEvent) {
    if (!stack.length || !dnd.draggingId || !stageEl || dnd.peek) return;
    const top = stageEl.querySelector<HTMLElement>('.layer.top .popup');
    const draggedEl = document.querySelector('[data-drag="dragging"]');
    if (!top || !draggedEl || !stageEl.contains(draggedEl)) return;
    const r = top.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside) {
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = null;
    } else if (!peekTimer) {
      peekTimer = setTimeout(() => {
        peekTimer = null;
        if (dnd.draggingId) dnd.peek = true;
      }, 350);
    }
  }
  $effect(() => {
    if (!dnd.draggingId && peekTimer) {
      clearTimeout(peekTimer);
      peekTimer = null;
    }
  });
</script>

<svelte:window onpointermove={onWindowMove} />

{#if stack.length}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="backdrop" class:peek={dnd.peek} onclick={(e) => e.target === e.currentTarget && store.clearFocus()}>
    <div class="stage" class:peek={dnd.peek} bind:this={stageEl}>
      {#each stack as id, i (id)}
        {@const depth = stack.length - 1 - i}
        <div class="layer" class:top={depth === 0} style:--d={depth} style:--r="{depth === 0 ? 0 : i % 2 ? 2.2 : -2.6}deg" inert={depth > 0 ? true : undefined}>
          <CardPopup cardId={id} isTop={depth === 0} />
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(43, 36, 24, 0.45);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 20px;
    overflow: auto;
    animation: fade 140ms ease-out;
  }
  .backdrop.peek {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    pointer-events: none;
    overflow: visible;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .stage {
    position: relative;
    width: min(1100px, 100%);
  }
  .stage.peek {
    visibility: hidden;
  }
  :global(.stage.peek .card[data-drag='dragging']) {
    visibility: visible;
  }
  .layer {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    transform-origin: 50% 20%;
    transform: translate(calc(var(--d) * -12px), calc(var(--d) * -12px)) rotate(var(--r)) scale(calc(1 - var(--d) * 0.02));
    transition: transform 280ms var(--ease-snap);
    z-index: calc(10 - var(--d));
    filter: brightness(calc(1 - var(--d) * 0.06));
  }
  .layer.top {
    position: relative;
    filter: none;
  }
</style>
