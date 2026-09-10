<script lang="ts">
  import { effectivePoints } from '../model/capacity';
  import { AGE_GROUPS, ageGroupKey } from '../model/staleness';
  import { store } from '../model/store.svelte';
  import { EFFORT_LABELS, VALUE_LABELS, type Card as CardT, type ViewMode } from '../model/types';
  import Card from './Card.svelte';
  import { dnd } from './dnd.svelte';

  let { view }: { view: Exclude<ViewMode, 'bucket'> } = $props();

  interface Column {
    key: string;
    label: string;
    drop: string | null;
    hint?: string;
    cards: CardT[];
  }

  const pool = $derived.by(() => {
    const q = store.search.toLowerCase();
    return store.openCards.filter(
      (c) =>
        c.kind !== 'person' &&
        c.bucketId != null &&
        (!q || c.title.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q)))
    );
  });

  const columns = $derived.by((): Column[] => {
    const cols: Column[] = [];
    const by = (pred: (c: CardT) => boolean) => pool.filter(pred);
    switch (view) {
      case 'effort':
        cols.push({ key: 'none', label: 'Unsized', drop: 'effort:none', cards: by((c) => c.effort == null) });
        for (const e of [1, 2, 3, 4, 5] as const) cols.push({ key: `e${e}`, label: EFFORT_LABELS[e], drop: `effort:${e}`, cards: by((c) => c.effort === e) });
        break;
      case 'value':
        cols.push({ key: 'none', label: 'Unrated', drop: 'value:none', cards: by((c) => c.value == null) });
        for (const v of [1, 2, 3] as const) cols.push({ key: `v${v}`, label: VALUE_LABELS[v], drop: `value:${v}`, cards: by((c) => c.value === v) });
        break;
      case 'matrix': {
        const lowE = (c: CardT) => (c.effort ?? 0) <= 2;
        const highV = (c: CardT) => (c.value ?? 0) >= 2;
        const sized = (c: CardT) => c.effort != null && c.value != null;
        cols.push({ key: 'quick', label: 'Quick wins', hint: 'high value · low effort', drop: 'matrix:quick', cards: by((c) => sized(c) && lowE(c) && highV(c)) });
        cols.push({ key: 'big', label: "Life's work", hint: 'high value · high effort', drop: 'matrix:big', cards: by((c) => sized(c) && !lowE(c) && highV(c)) });
        cols.push({ key: 'fill', label: 'Fill-ins', hint: 'lower value · low effort', drop: 'matrix:fill', cards: by((c) => sized(c) && lowE(c) && !highV(c)) });
        cols.push({ key: 'avoid', label: 'Reconsider', hint: 'lower value · high effort', drop: 'matrix:avoid', cards: by((c) => sized(c) && !lowE(c) && !highV(c)) });
        cols.push({ key: 'unsized', label: 'Needs sizing', hint: 'missing effort or value', drop: null, cards: by((c) => !sized(c)) });
        break;
      }
      case 'person':
        cols.push({ key: 'none', label: 'Nobody', drop: 'person:none', cards: by((c) => c.peopleIds.length === 0) });
        for (const p of store.people) cols.push({ key: p.id, label: p.title, drop: `person:${p.id}`, cards: by((c) => c.peopleIds.includes(p.id) || c.parentId === p.id) });
        break;
      case 'tag':
        cols.push({ key: 'none', label: 'Untagged', drop: 'tag:none', cards: by((c) => c.tags.length === 0) });
        for (const t of store.tags) cols.push({ key: t, label: `#${t}`, drop: `tag:${t}`, cards: by((c) => c.tags.includes(t)) });
        break;
      case 'age': {
        const now = Date.now();
        for (const g of AGE_GROUPS)
          cols.push({ key: g.key, label: g.label, drop: null, cards: by((c) => ageGroupKey(c.createdAt, now) === g.key) });
        break;
      }
    }
    return cols;
  });

  const points = (cards: CardT[]) => cards.reduce((s, c) => s + (c.kind === 'todo' ? effectivePoints(c, store.capIdx) : 0), 0);

</script>

<div class="group-view" class:matrix={view === 'matrix'}>
  {#each columns as col (col.key)}
    <section class="col" class:over={col.drop != null && dnd.overDropKey === col.drop && dnd.intent === 'none'} class:nodrop={col.drop == null}>
      <header>
        <h2 class="display">{col.label}</h2>
        {#if col.hint}<span class="hint">{col.hint}</span>{/if}
        <span class="count">{col.cards.length} · {points(col.cards)} pts</span>
      </header>
      <div class="flow" data-drop={col.drop ?? undefined}>
        {#each col.cards as card (card.id)}
          <Card {card} layout="flow" dropKey={col.drop} />
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .group-view {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    padding: 12px 16px 40px;
    align-items: start;
  }
  .group-view.matrix {
    grid-template-columns: repeat(2, 1fr);
  }
  .group-view.matrix .col:last-child {
    grid-column: 1 / -1;
  }
  .col {
    border: var(--border) solid var(--tray-line);
    border-radius: 10px;
    background: var(--tray);
    min-height: 180px;
    transition:
      background 120ms,
      border-color 120ms;
  }
  .col.over {
    background: var(--tray-hover);
    border-color: var(--accent);
    border-style: dashed;
  }
  .col.nodrop {
    border-style: dotted;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 12px 6px;
    border-bottom: 1.5px dashed var(--tray-line);
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .hint {
    font-size: 11px;
    color: var(--ink-faint);
  }
  .count {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-faint);
    white-space: nowrap;
  }
  .flow {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    padding: 14px;
    min-height: 120px;
  }
</style>
