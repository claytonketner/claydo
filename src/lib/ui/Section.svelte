<script lang="ts">
  import { store } from '../model/store.svelte';
  import { CARD_H, CARD_W, type Bucket } from '../model/types';
  import Card from './Card.svelte';
  import Meter from './Meter.svelte';
  import { dnd } from './dnd.svelte';
  import { cardHeights } from './ui.svelte';

  let { bucket, filter = '' }: { bucket: Bucket; filter?: string } = $props();

  const dropKey = $derived(`bucket:${bucket.id}`);
  const cards = $derived.by(() => {
    const all = store.cardsInBucket(bucket.id);
    if (!filter) return all;
    const q = filter.toLowerCase();
    return all.filter((c) => c.title.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q)));
  });
  const load = $derived(store.loads.get(bucket.id));
  const over = $derived(dnd.overDropKey === dropKey && dnd.draggingId != null && !dnd.nestIntent);
  let bodyWidth = $state(600);
  const maxX = $derived(Math.max(0, bodyWidth - CARD_W - 8));
  const height = $derived(Math.max(150, ...cards.map((c) => c.pos.y + (cardHeights[c.id] ?? CARD_H) + 30)));

  let renaming = $state(false);
  let nameDraft = $state('');

  function onDbl(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-card]')) return;
    const body = e.currentTarget as HTMLElement;
    const r = body.getBoundingClientRect();
    const x = Math.min(maxX, Math.max(0, e.clientX - r.left - CARD_W / 2));
    const y = Math.max(0, e.clientY - r.top - 20);
    store.addCard(
      {
        title: '',
        bucketId: bucket.id,
        kind: bucket.kind === 'people' ? 'person' : bucket.kind === 'ideas' ? 'idea' : 'todo',
        pos: { x, y }
      },
      { edit: true }
    );
  }
  function onBodyClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-card]')) return;
    store.selectedId = null;
    store.editingId = null;
  }
  function commitName() {
    const n = nameDraft.trim();
    if (n && n !== bucket.name) store.updateBucket(bucket.id, { name: n });
    renaming = false;
  }
</script>

<section class="tray kind-{bucket.kind}" class:over>
  <header>
    {#if renaming}
      <input
        class="rename"
        bind:value={nameDraft}
        onblur={commitName}
        onkeydown={(e) => {
          if (e.key === 'Enter') commitName();
          if (e.key === 'Escape') renaming = false;
          e.stopPropagation();
        }}
      />
    {:else}
      <h2
        class="display"
        ondblclick={() => {
          nameDraft = bucket.name;
          renaming = true;
        }}
        title="Double-click to rename"
      >
        {bucket.name}
      </h2>
    {/if}
    <span class="count">{cards.length}</span>
    {#if bucket.kind === 'time' && load}
      <Meter {bucket} {load} />
    {/if}
  </header>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="body" data-drop={dropKey} style:min-height="{height}px" bind:clientWidth={bodyWidth} ondblclick={onDbl} onclick={onBodyClick}>
    {#each cards as card (card.id)}
      <Card {card} layout="free" {dropKey} {maxX} />
    {/each}
    {#if cards.length === 0}
      <div class="empty">double-click to add</div>
    {/if}
  </div>
</section>

<style>
  .tray {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: var(--border) solid var(--tray-line);
    border-radius: 10px;
    background: var(--tray);
    transition:
      background 120ms,
      border-color 120ms;
  }
  .tray.over {
    background: var(--tray-hover);
    border-color: var(--accent);
    border-style: dashed;
  }
  .tray.kind-people {
    border-color: rgba(74, 155, 255, 0.5);
  }
  .tray.kind-ideas {
    border-style: dashed;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 6px;
    border-bottom: 1.5px dashed var(--tray-line);
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: default;
  }
  .rename {
    font-weight: 700;
    font-size: 13px;
    padding: 1px 4px;
    border: 1.5px solid var(--ink);
    border-radius: 4px;
    background: #fff;
    color: #2b2418;
  }
  .count {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-faint);
  }
  .body {
    position: relative;
    flex: 1;
    padding: 0;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--ink-faint);
    font-size: 12px;
    pointer-events: none;
  }
</style>
