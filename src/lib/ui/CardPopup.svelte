<script lang="ts">
  import { staleStage, STALE_LABELS } from '../model/staleness';
  import { store } from '../model/store.svelte';
  import { EFFORT_LABELS, type Card as CardT } from '../model/types';
  import Card from './Card.svelte';
  import { dnd } from './dnd.svelte';
  import { ui } from './ui.svelte';

  let { cardId, isTop = true }: { cardId: string; isTop?: boolean } = $props();

  const card = $derived(store.card(cardId));
  const isPerson = $derived(card?.kind === 'person');
  const kids = $derived(card ? store.childrenOf(card.id) : []);
  const open = $derived(kids.filter((k) => k.doneAt == null));
  const doneKids = $derived(kids.filter((k) => k.doneAt != null).sort((a, b) => b.doneAt! - a.doneAt!));
  /** Once the card itself is done, show its whole sub-todo tree (done included) instead of collapsing it away. */
  const shown = $derived(card?.doneAt != null ? kids : open);
  const inherited = $derived(shown.filter((k) => k.bucketId == null));
  const parent = $derived(card?.parentId ? store.card(card.parentId) : null);
  const parentIsPerson = $derived(parent?.kind === 'person');
  const isAgendaItem = $derived(!!card && store.isAgendaItem(card));
  const bucket = $derived(card ? store.bucketOf(card) : null);
  const timeBuckets = $derived(store.timeBuckets);
  const ideasBucket = $derived(store.buckets.find((b) => b.kind === 'ideas') ?? null);
  const people = $derived(card ? card.peopleIds.map((id) => store.live(id)).filter((p): p is CardT => !!p) : []);
  const mentions = $derived(card && isPerson ? store.mentionsOf(card.id) : []);
  const recentlyDone = $derived(isPerson ? doneKids.filter((k) => Date.now() - k.doneAt! < 14 * 86_400_000) : []);
  const stale = $derived(store.doc.settings.agingEnabled && card && card.kind === 'todo' && bucket?.kind === 'time' && card.doneAt == null ? staleStage(card.createdAt) : 0);
  const otherPeople = $derived(card ? store.people.filter((p) => p.id !== card.id && !card.peopleIds.includes(p.id)) : []);
  const days = $derived(card ? Math.floor((Date.now() - card.createdAt) / 86_400_000) : 0);

  let addInput = $state<HTMLInputElement | null>(null);
  let addText = $state('');
  let tagText = $state('');
  let personPick = $state('');

  $effect(() => {
    if (card && isTop && ui.wantFocusAdd) {
      ui.wantFocusAdd = false;
      requestAnimationFrame(() => addInput?.focus());
    }
  });

  function addTag() {
    if (!card) return;
    const tags = tagText
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').toLowerCase())
      .filter(Boolean)
      .filter((t) => !card.tags.includes(t));
    if (tags.length) store.updateCard(card.id, { tags: [...card.tags, ...tags] }, { label: 'add tag' });
    tagText = '';
  }
  function removeTag(t: string) {
    if (card) store.updateCard(card.id, { tags: card.tags.filter((x) => x !== t) }, { label: 'remove tag' });
  }
  function addPerson() {
    if (!card) return;
    const v = personPick.trim();
    if (!v) return;
    for (const id of store.ensurePeople([v])) if (!card.peopleIds.includes(id)) store.togglePerson(card.id, id);
    personPick = '';
  }
  function setBucket(v: string) {
    if (!card) return;
    if (v === 'inherit') store.updateCard(card.id, { bucketId: null }, { label: 'inherit bucket' });
    else if (v.startsWith('agenda:')) {
      if (store.nest(card.id, v.slice(7))) store.showToast(`Added to ${store.card(v.slice(7))?.title}'s agenda`, () => store.undo());
    } else if (card.parentId) {
      const b = store.doc.buckets.find((x) => x.id === v);
      store.updateCard(card.id, { bucketId: v, pos: store.freeSpot(v, card.id), kind: b?.kind === 'ideas' ? 'idea' : card.kind === 'idea' && b?.kind === 'time' ? 'todo' : card.kind }, { label: 'schedule' });
    } else store.moveToBucket(card.id, v);
  }
  function submitChild() {
    if (!card) return;
    const t = addText.trim();
    if (!t) return;
    store.quickAdd(t, { parentId: card.id });
    addText = '';
  }
  const stop = (e: KeyboardEvent) => e.stopPropagation();
</script>

{#if card}
  <div class="popup px" role="dialog" aria-label={card.title}>
    <nav class="bar">
      <span class="crumb">{isPerson ? 'Person' : card.kind === 'idea' ? 'Idea' : isAgendaItem ? 'Agenda item' : 'Todo'}</span>
      {#if parent}<span class="sep">·</span><button class="btn ghost sm" onclick={() => store.focus(parent.id)}>↰ {parent.title || 'untitled'}</button>{/if}
      <span class="spacer"></span>
      {#if !isPerson}<span class="hint">{isAgendaItem ? 'Drag it out of this window and hold to make it a todo on the board' : 'Drag this card or a sub-todo out of this window and hold to place it on the board'}</span>{/if}
      <button class="btn sm" onclick={() => store.popFocus()}>close <span class="kbd">esc</span></button>
    </nav>

    <div class="top">
      <div class="card-wrap">
        <Card {card} layout="flow" dropKey={null} showParent={false} popup />
      </div>

      <div class="side">
        {#if !isPerson}
          {#if !isAgendaItem}
            <div class="row">
              <span class="lbl">Effort</span>
              <div class="seg">
                {#each [1, 2, 3, 4, 5] as const as e}
                  <button class="btn sm" class:active={card.effort === e} onclick={() => store.setEffort(card.id, e)}>{EFFORT_LABELS[e]}</button>
                {/each}
              </div>
            </div>
            <div class="row">
              <span class="lbl">Value</span>
              <div class="seg">
                {#each [1, 2, 3] as const as v}
                  <button class="btn sm star" class:active={card.value != null && card.value >= v} onclick={() => store.setValue(card.id, v)}>★</button>
                {/each}
              </div>
            </div>
          {/if}
          <div class="row">
            <span class="lbl">When</span>
            <select value={card.bucketId ?? 'inherit'} onchange={(e) => setBucket((e.target as HTMLSelectElement).value)}>
              {#if card.parentId}
                <option value="inherit">{parentIsPerson ? `Agenda · ${parent?.title}` : `Inherits (${parent ? (store.bucketOf(parent)?.name ?? 'parent') : 'parent'})`}</option>
              {:else}
                {#each people as p (p.id)}<option value="agenda:{p.id}">Agenda · {p.title}</option>{/each}
              {/if}
              {#each timeBuckets as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
              {#if ideasBucket}<option value={ideasBucket.id}>{ideasBucket.name}</option>{/if}
            </select>
            {#if isAgendaItem}<span class="note">Agenda items don't show on the main board</span>{/if}
          </div>
          <div class="row">
            <span class="lbl">Tags</span>
            <div class="chips">
              {#each card.tags as t (t)}
                <span class="chip tag">#{t} <button class="x" onclick={() => removeTag(t)} title="Remove">✕</button></span>
              {/each}
              <input class="mini" placeholder="+ tag" bind:value={tagText} list="claydo-tags-{card.id}" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } stop(e); }} onblur={addTag} />
              <datalist id="claydo-tags-{card.id}">{#each store.tags as t}<option value={t}></option>{/each}</datalist>
            </div>
          </div>
          <div class="row">
            <span class="lbl">People</span>
            <div class="chips">
              {#each people as p (p.id)}
                <span class="chip person">
                  <button class="jump" onclick={() => store.focus(p.id)} title="Open {p.title}">{p.title} ↗</button>
                  <button class="x" onclick={() => store.togglePerson(card.id, p.id)} title="Unlink">✕</button>
                </span>
              {/each}
              <input class="mini" placeholder="+ person" bind:value={personPick} list="claydo-people-{card.id}" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } stop(e); }} onblur={addPerson} />
              <datalist id="claydo-people-{card.id}">{#each otherPeople as p}<option value={p.title}></option>{/each}</datalist>
            </div>
          </div>
        {/if}
        <div class="row meta">
          {#if bucket}<span class="badge">{bucket.name}</span>{/if}
          <span class="age" title="Created {new Date(card.createdAt).toLocaleDateString()}">{days === 0 ? 'created today' : `${days}d old`}{#if stale}, {STALE_LABELS[stale]}{/if}</span>
          {#if stale}
            <button class="btn sm" title="Reset its age so it looks new again" onclick={() => store.refresh(card.id)}>↻ Like new</button>
          {/if}
        </div>
        <div class="row actions">
          {#if card.doneAt != null}
            <button class="btn sm" onclick={() => store.reopen(card.id)}>↺ Reopen</button>
          {:else if !isPerson}
            <button class="btn sm" onclick={() => store.requestComplete(card.id)}>✓ Done</button>
          {/if}
          <button class="btn sm" onclick={() => store.duplicate(card.id)}>⧉ Duplicate</button>
          <button class="btn sm danger" onclick={() => store.requestDelete(card.id)}>✕ Delete</button>
        </div>
      </div>
    </div>

    {#if isPerson}
      <section class="agenda">
        <h3 class="display">Agenda <span class="count">{open.length + mentions.length}</span></h3>
        <div class="agenda-list">
          {#each open as item (item.id)}
            <div class="item" class:external={item.bucketId != null}>
              <input type="checkbox" onchange={() => store.requestComplete(item.id)} title="Done" />
              <button class="item-title" onclick={() => store.focus(item.id)}>{#if item.bucketId != null}↗ {/if}{item.title}</button>
              {#if item.bucketId}<span class="badge small">{store.bucketOf(item)?.name}</span>{/if}
            </div>
          {/each}
          {#each mentions as m (m.id)}
            <div class="item external">
              <input type="checkbox" onchange={() => store.requestComplete(m.id)} title="Done" />
              <button class="item-title" onclick={() => store.focus(m.id)}>↗ {m.title}</button>
              <span class="badge small">{store.bucketOf(m)?.name ?? ''}</span>
            </div>
          {/each}
          {#if open.length + mentions.length === 0}<div class="empty">Nothing queued up.</div>{/if}
        </div>
        <input bind:this={addInput} class="add" placeholder="Add to agenda… (↵)" bind:value={addText} onkeydown={(e) => { if (e.key === 'Enter') submitChild(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); stop(e); }} />
        {#if recentlyDone.length}
          <details class="done">
            <summary>Recently discussed ({recentlyDone.length})</summary>
            {#each recentlyDone as d (d.id)}
              <div class="done-row"><span>✓ {d.title}</span><button class="btn ghost sm" onclick={() => store.reopen(d.id)}>reopen</button></div>
            {/each}
          </details>
        {/if}
      </section>
    {:else}
      <section class="children">
        <div class="children-head">
          <h3 class="display">Sub-todos <span class="count">{open.length} open · {doneKids.length} done</span></h3>
          <input bind:this={addInput} class="add" placeholder="Add a sub-todo… (@person #tag !effort >today)" bind:value={addText} onkeydown={(e) => { if (e.key === 'Enter') submitChild(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); stop(e); }} />
        </div>
        <div class="trays">
          <section class="mini" class:over={isTop && dnd.overDropKey === 'inherit' && dnd.intent === 'none'}>
            <header><h4 class="display">Inherits</h4><span class="sub">{bucket ? bucket.name : 'parent'}</span><span class="count">{inherited.length}</span></header>
            <div class="flow" data-drop={isTop ? 'inherit' : undefined}>
              {#each inherited as k (k.id)}
                <Card card={k} layout="flow" dropKey="inherit" showParent={false} />
              {/each}
              {#if inherited.length === 0}<div class="empty">nothing scheduled separately</div>{/if}
            </div>
          </section>
          {#each [...timeBuckets, ...(ideasBucket ? [ideasBucket] : [])] as b (b.id)}
            {@const here = shown.filter((k) => k.bucketId === b.id)}
            <section class="mini kind-{b.kind}" class:over={isTop && dnd.overDropKey === `bucket:${b.id}` && dnd.intent === 'none'}>
              <header><h4 class="display">{b.name}</h4><span class="count">{here.length}</span></header>
              <div class="flow" data-drop={isTop ? `bucket:${b.id}` : undefined}>
                {#each here as k (k.id)}
                  <Card card={k} layout="flow" dropKey="bucket:{b.id}" showParent={false} />
                {/each}
              </div>
            </section>
          {/each}
        </div>
        {#if doneKids.length && card?.doneAt == null}
          <details class="done">
            <summary>Done ({doneKids.length})</summary>
            {#each doneKids as d (d.id)}
              <div class="done-row"><span>✓ {d.title}</span><button class="btn ghost sm" onclick={() => store.reopen(d.id)}>reopen</button></div>
            {/each}
          </details>
        {/if}
      </section>
    {/if}
  </div>
{/if}

<style>
  .popup {
    width: 100%;
    background: var(--bg);
    padding: 12px 16px 16px;
    animation: pop-in 200ms var(--ease-snap);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .crumb {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .sep {
    color: var(--ink-faint);
  }
  .spacer {
    flex: 1;
  }
  .hint {
    font-size: 11px;
    color: var(--ink-faint);
  }

  .top {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(300px, 1fr);
    gap: 22px;
    align-items: start;
    margin-bottom: 16px;
  }
  @media (max-width: 760px) {
    .top {
      grid-template-columns: 1fr;
    }
  }
  .card-wrap {
    position: relative;
    padding: 6px 6px 6px 0;
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .note {
    font-size: 11.5px;
    color: var(--ink-soft);
  }
  .lbl {
    width: 58px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
    font-weight: 700;
  }
  .seg {
    display: flex;
    gap: 3px;
  }
  .star.active {
    background: #e0a400;
    color: #fff;
  }
  select {
    padding: 4px 6px;
    border: 1.5px solid var(--field-line);
    border-radius: 4px;
    background: var(--field);
    color: var(--field-ink);
    font-size: 12.5px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    flex: 1;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .chip.tag {
    background: rgba(74, 155, 255, 0.18);
    color: #1f5aa8;
  }
  .chip.person {
    background: #2b2418;
    color: var(--paper);
    padding-left: 0;
  }
  .jump {
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 2px 4px 2px 8px;
  }
  .jump:hover {
    text-decoration: underline;
  }
  .x {
    border: 0;
    background: none;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    font-size: 10px;
    padding: 0 2px;
  }
  .x:hover {
    opacity: 1;
  }
  .mini {
    width: 90px;
    padding: 3px 6px;
    border: 1.5px dashed var(--field-line);
    border-radius: 4px;
    background: transparent;
    color: var(--ink);
    font-size: 12px;
    outline: none;
  }
  .mini:focus {
    border-style: solid;
    border-color: var(--accent);
    background: var(--field);
    color: var(--field-ink);
  }
  .meta {
    font-size: 11.5px;
    color: var(--ink-soft);
  }
  .badge {
    background: rgba(127, 120, 100, 0.2);
    border-radius: 3px;
    padding: 2px 6px;
    font-weight: 700;
    font-size: 11px;
  }
  .badge.small {
    font-size: 10px;
    background: var(--accent-2);
    color: #fff;
  }
  .actions {
    margin-top: 2px;
  }
  .btn.danger:hover {
    background: var(--over);
    color: #fff;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 12.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  h3 .count,
  .mini header .count {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-faint);
    text-transform: none;
    letter-spacing: 0;
  }
  .children-head {
    display: flex;
    gap: 14px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .add {
    flex: 1;
    min-width: 240px;
    padding: 8px 10px;
    border: var(--border) solid var(--line);
    border-radius: var(--radius);
    background: var(--field);
    color: var(--field-ink);
    box-shadow: 3px 3px 0 var(--shadow);
    outline: none;
    font-size: 13.5px;
  }
  .add:focus {
    box-shadow: 3px 3px 0 var(--accent);
  }
  .trays {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 10px;
  }
  section.mini {
    width: auto;
    padding: 0;
    border: 1.5px solid var(--tray-line);
    border-radius: 8px;
    background: var(--tray);
    min-height: 130px;
    font-size: inherit;
    color: inherit;
    transition:
      background 120ms,
      border-color 120ms;
  }
  section.mini.kind-ideas {
    border-style: dashed;
  }
  section.mini.over {
    background: var(--tray-hover);
    border-color: var(--accent);
    border-style: dashed;
  }
  .mini header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 6px 10px 4px;
    border-bottom: 1.5px dashed var(--tray-line);
  }
  .mini header .count {
    margin-left: auto;
  }
  h4 {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sub {
    font-size: 11px;
    color: var(--ink-faint);
  }
  .flow {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px;
    min-height: 90px;
  }
  .empty {
    align-self: center;
    width: 100%;
    text-align: center;
    color: var(--ink-faint);
    font-size: 11px;
  }

  .agenda-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 8px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    padding: 3px 4px;
    border-radius: 4px;
  }
  .item:hover {
    background: var(--tray-hover);
  }
  .item input {
    accent-color: var(--done);
    width: 15px;
    height: 15px;
    cursor: pointer;
  }
  .item-title {
    flex: 1;
    text-align: left;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    padding: 0;
  }
  .item-title:hover {
    text-decoration: underline;
  }
  .item.external .item-title {
    color: var(--accent-2);
  }
  .agenda .add {
    width: 100%;
  }
  .done {
    margin-top: 12px;
    font-size: 12.5px;
    color: var(--ink-soft);
  }
  .done summary {
    cursor: pointer;
  }
  .done-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 6px;
    text-decoration: line-through;
  }
</style>
