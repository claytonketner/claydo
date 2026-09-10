<script lang="ts">
  import { store } from '../model/store.svelte';
  import { CARD_H, CARD_W, type Bucket, type Card as CardT } from '../model/types';
  import Card from './Card.svelte';
  import Icon from './Icon.svelte';
  import Meter from './Meter.svelte';
  import { dnd } from './dnd.svelte';

  let { bucket, filter = '' }: { bucket: Bucket; filter?: string } = $props();

  const isDone = $derived(bucket.kind === 'done');
  const dropKey = $derived(`bucket:${bucket.id}`);
  const DONE_SHOWN = 20;
  const DONE_STEP = 34;

  const cards = $derived.by(() => {
    const all = isDone ? store.doneCards.filter((c) => c.kind !== 'person' && !c.parentId).slice(0, DONE_SHOWN) : store.cardsInBucket(bucket.id);
    if (!filter) return all;
    const q = filter.toLowerCase();
    return all.filter((c) => c.title.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q)));
  });
  const load = $derived(store.loads.get(bucket.id));
  const hovering = $derived(dnd.overDropKey === dropKey && dnd.draggingId != null);
  const over = $derived(hovering && dnd.intent === 'none');
  /** Extra room that opens up below the cards while something is being dragged over this tray. */
  const extra = $derived(hovering ? 170 : 0);
  let bodyWidth = $state(600);
  const maxX = $derived(Math.max(0, bodyWidth - CARD_W - 8));
  $effect(() => {
    store.trayWidths[bucket.id] = bodyWidth;
    if (isDone) store.doneTrayWidth = bodyWidth;
  });
  const yOf = (c: CardT, i: number) => (isDone ? 16 + i * DONE_STEP : c.pos.y);
  const height = $derived(Math.max(isDone ? 110 : 150, ...cards.map((c, i) => yOf(c, i) + (store.cardHeights[c.id] ?? CARD_H) + 30)) + extra);
  const WEEK = 7 * 86_400_000;
  const doneThisWeek = $derived(isDone ? store.doneCards.filter((c) => Date.now() - c.doneAt! < WEEK).length : 0);

  /** Hulls around clusters with 2+ members on this tray. */
  const hulls = $derived.by(() => {
    if (isDone) return [];
    const groups = new Map<string, CardT[]>();
    for (const c of cards) if (c.clusterId) groups.set(c.clusterId, [...(groups.get(c.clusterId) ?? []), c]);
    const out: { id: string; color: string; x: number; y: number; w: number; h: number }[] = [];
    for (const [id, members] of groups) {
      if (members.length < 2 || id === dnd.draggingClusterId) continue;
      const color = store.doc.clusters.find((k) => k.id === id)?.color ?? '#999';
      const x0 = Math.min(...members.map((m) => Math.min(m.pos.x, maxX)));
      const y0 = Math.min(...members.map((m) => m.pos.y));
      const x1 = Math.max(...members.map((m) => Math.min(m.pos.x, maxX) + CARD_W));
      const y1 = Math.max(...members.map((m) => m.pos.y + (store.cardHeights[m.id] ?? CARD_H)));
      out.push({ id, color, x: x0 - 8, y: y0 - 8, w: x1 - x0 + 16, h: y1 - y0 + 16 });
    }
    return out;
  });

  let renaming = $state(false);
  let nameDraft = $state('');

  function onDbl(e: MouseEvent) {
    if (isDone) return;
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
  function commitName() {
    const n = nameDraft.trim();
    if (n && n !== bucket.name) store.updateBucket(bucket.id, { name: n });
    renaming = false;
  }
</script>

<!-- While a drag hovers, the tray grows extra room below its cards; everything beneath moves down. -->
<section class="tray kind-{bucket.kind}" class:over class:hovering>
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
          if (isDone) return;
          nameDraft = bucket.name;
          renaming = true;
        }}
        title={isDone ? undefined : 'Double-click to rename'}
      >
        {bucket.name}
      </h2>
    {/if}
    {#if isDone}
      <span class="count"><b>{doneThisWeek}</b> this week · {store.doneCards.length} total{#if store.doneCards.length > DONE_SHOWN} · showing {DONE_SHOWN}{/if}</span>
      <span class="spacer"></span>
      <span class="hint">drop here to finish</span>
      <button class="btn sm" onclick={() => (store.reflectOpen = true)}><Icon name="eye" size={17} />Reflect</button>
    {:else}
      <span class="count">{cards.length}</span>
      {#if bucket.kind === 'time' && load}
        <Meter {bucket} {load} />
      {/if}
    {/if}
  </header>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="body" class:timeline={isDone} data-drop={dropKey} style:min-height="{height}px" bind:clientWidth={bodyWidth} ondblclick={onDbl}>
    {#each hulls as h (h.id)}
      <div class="hull" style:left="{h.x}px" style:top="{h.y}px" style:width="{h.w}px" style:height="{h.h}px" style:--c={h.color}>
        <button class="ungroup" title="Ungroup these cards" onclick={() => store.dissolveCluster(h.id)}>✕</button>
      </div>
    {/each}
    {#each cards as card, i (card.id)}
      <Card {card} layout="free" {dropKey} {maxX} y={isDone ? yOf(card, i) : null} />
    {/each}
    {#if cards.length === 0}
      <div class="empty">{isDone ? 'nothing finished yet' : 'double-click to add'}</div>
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
  .tray.kind-done {
    border-style: dashed;
    background: rgba(127, 207, 136, 0.08);
  }
  .tray.kind-done.over {
    background: rgba(127, 207, 136, 0.25);
    border-color: var(--done);
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
    background: var(--field);
    color: var(--field-ink);
  }
  .count {
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1;
    color: var(--ink-faint);
  }
  .spacer {
    flex: 1;
  }
  .hint {
    font-size: 11px;
    color: var(--ink-faint);
  }
  .body {
    position: relative;
    flex: 1;
    padding: 0;
    transition: min-height 200ms var(--ease-out);
  }
  .body.timeline {
    background-image: radial-gradient(circle, rgba(47, 154, 58, 0.35) 1px, transparent 1.5px);
    background-size: 100% 34px;
    background-position: 0 30px;
  }
  .hull {
    position: absolute;
    border: 2px dashed var(--c);
    border-radius: 12px;
    background: color-mix(in srgb, var(--c) 8%, transparent);
    pointer-events: none;
    z-index: 0;
    transition:
      left 200ms var(--ease-out),
      top 200ms var(--ease-out),
      width 200ms var(--ease-out),
      height 200ms var(--ease-out);
  }
  .ungroup {
    position: absolute;
    top: -9px;
    right: -9px;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 2px solid var(--line);
    border-radius: 50%;
    background: var(--c);
    color: #fff;
    font-size: 9px;
    font-weight: 900;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 1px 1px 0 var(--shadow);
    opacity: 0.85;
  }
  .ungroup:hover {
    opacity: 1;
    scale: 1.15;
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
