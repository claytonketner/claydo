<script lang="ts">
  import { dnd } from './dnd.svelte';

  /** Hull around the dragged card and its target, plus the GROUP / NEST label. */
  const hull = $derived.by(() => {
    const a = dnd.dragRect;
    const b = dnd.targetRect;
    if (!a || !b || (dnd.intent === 'none' && !dnd.groupHint)) return null;
    const pad = 10;
    const left = Math.min(a.left, b.left) - pad;
    const top = Math.min(a.top, b.top) - pad;
    const right = Math.max(a.left + a.width, b.left + b.width) + pad;
    const bottom = Math.max(a.top + a.height, b.top + b.height) + pad;
    return { left, top, width: right - left, height: bottom - top };
  });
  const progress = $derived(dnd.nestProgress);
</script>

{#if dnd.draggingId && (dnd.intent !== 'none' || dnd.groupHint) && hull && dnd.dragRect}
  {@const mode = dnd.intent === 'none' ? 'hint' : dnd.intent}
  <div class="hull {mode}" style:left="{hull.left}px" style:top="{hull.top}px" style:width="{hull.width}px" style:height="{hull.height}px"></div>
  {#key mode}
    <div class="label {mode}" style:left="{dnd.dragRect.left + dnd.dragRect.width / 2}px" style:top="{dnd.dragRect.top - (mode === 'hint' ? 44 : 34)}px">
      <span class="word">
        {dnd.intent === 'nest' ? 'NEST' : 'GROUP'}
        {#if mode === 'hint'}<span class="sub">hold ⇧</span>{/if}
      </span>
      {#if mode !== 'hint'}<span class="bar" title="Move onto the middle of the card to nest"><span class="fill" style:width="{progress * 100}%"></span></span>{/if}
    </div>
  {/key}
{/if}

<style>
  .hull {
    position: fixed;
    z-index: 90;
    pointer-events: none;
    border-radius: 14px;
    border: 2px dashed var(--accent-2);
    background: rgba(74, 155, 255, 0.08);
    transition:
      left 60ms linear,
      top 60ms linear,
      width 60ms linear,
      height 60ms linear;
  }
  .hull.hint {
    opacity: 0.45;
    border-style: dotted;
    background: transparent;
  }
  .label.hint {
    opacity: 0.75;
  }
  .word {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }
  .sub {
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 9.5px;
    letter-spacing: 0.02em;
    opacity: 0.9;
  }
  .hull.nest {
    border: 3px solid var(--accent);
    background: rgba(255, 107, 74, 0.12);
    animation: pop 220ms var(--ease-snap);
  }
  @keyframes pop {
    0% {
      scale: 0.96;
    }
    60% {
      scale: 1.03;
    }
    100% {
      scale: 1;
    }
  }
  .label {
    position: fixed;
    z-index: 110;
    pointer-events: none;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    animation: pop-in 200ms var(--ease-snap);
  }
  .word {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 0.12em;
    padding: 3px 9px;
    border: 2px solid var(--line);
    border-radius: 4px;
    background: var(--accent-2);
    color: #fff;
    box-shadow: 2px 2px 0 var(--shadow);
  }
  .label.nest .word {
    background: var(--accent);
  }
  .bar {
    width: 70px;
    height: 6px;
    border: 1.5px solid var(--line);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.8);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 50ms linear;
  }
  .label.nest .fill {
    background: var(--accent);
    width: 100% !important;
  }
</style>
