<script lang="ts">
  import { staleStage, STALE_LABELS } from '../model/staleness';
  import { store } from '../model/store.svelte';
  import { EFFORT_LABELS, type Card as CardT } from '../model/types';
  import Card from './Card.svelte';
  import { dnd } from './dnd.svelte';
  import { autosize, ui } from './ui.svelte';

  const card = $derived(store.focused);
  const crumbs = $derived(store.focusStack.map((id) => store.card(id)).filter((c): c is CardT => !!c));
  const ancestors = $derived(crumbs.slice(0, -1));
  const isPerson = $derived(card?.kind === 'person');
  const kids = $derived(card ? store.childrenOf(card.id) : []);
  const open = $derived(kids.filter((k) => k.doneAt == null));
  const doneKids = $derived(kids.filter((k) => k.doneAt != null).sort((a, b) => b.doneAt! - a.doneAt!));
  const inherited = $derived(open.filter((k) => k.bucketId == null));
  const parent = $derived(card?.parentId ? store.card(card.parentId) : null);
  const bucket = $derived(card ? store.bucketOf(card) : null);
  const timeBuckets = $derived(store.timeBuckets);
  const ideasBucket = $derived(store.buckets.find((b) => b.kind === 'ideas') ?? null);
  const people = $derived(card ? card.peopleIds.map((id) => store.card(id)).filter((p): p is CardT => !!p) : []);
  const mentions = $derived(card && isPerson ? store.mentionsOf(card.id) : []);
  const recentlyDone = $derived(isPerson ? doneKids.filter((k) => Date.now() - k.doneAt! < 14 * 86_400_000) : []);
  const stale = $derived(card && card.kind === 'todo' && bucket?.kind === 'time' && card.doneAt == null ? staleStage(card.createdAt) : 0);
  const otherPeople = $derived(card ? store.people.filter((p) => p.id !== card.id && !card.peopleIds.includes(p.id)) : []);
  const days = $derived(card ? Math.floor((Date.now() - card.createdAt) / 86_400_000) : 0);

  let addInput = $state<HTMLInputElement | null>(null);
  let addText = $state('');
  let tagText = $state('');
  let personPick = $state('');
  let titleDraft = $state('');
  let notesDraft = $state('');
  let notesEl = $state<HTMLTextAreaElement | null>(null);
  let notesScrollable = $state(false);
  let notesAtEnd = $state(true);
  let loadedFor = $state<string | null>(null);

  // Load drafts when the popup's card changes.
  $effect(() => {
    if (card && card.id !== loadedFor) {
      titleDraft = card.title;
      notesDraft = card.notes;
      loadedFor = card.id;
      requestAnimationFrame(checkNotesScroll);
    }
    if (!card) loadedFor = null;
  });
  $effect(() => {
    if (card && ui.wantFocusAdd) {
      ui.wantFocusAdd = false;
      requestAnimationFrame(() => addInput?.focus());
    }
  });

  function checkNotesScroll() {
    const el = notesEl;
    if (!el) return;
    notesScrollable = el.scrollHeight > el.clientHeight + 2;
    notesAtEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  }
  function saveTitle() {
    if (!card) return;
    const t = titleDraft.trim();
    if (t && t !== card.title) store.updateCard(card.id, { title: t }, { label: 'rename' });
    else if (!t) titleDraft = card.title;
  }
  function saveNotes() {
    if (!card) return;
    const n = notesDraft.replace(/\s+$/, '');
    if (n !== card.notes) store.updateCard(card.id, { notes: n }, { label: 'edit notes' });
  }
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
    const ids = v.startsWith('id:') ? [v.slice(3)] : store.ensurePeople([v]);
    for (const id of ids) if (!card.peopleIds.includes(id)) store.togglePerson(card.id, id);
    personPick = '';
  }
  function setBucket(v: string) {
    if (!card) return;
    if (v === 'inherit') store.updateCard(card.id, { bucketId: null }, { label: 'inherit bucket' });
    else if (card.parentId) {
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
  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) store.popFocus();
  }

  // Drag-out: hold a card outside the popup for a moment and the popup steps aside.
  let panelEl = $state<HTMLElement | null>(null);
  let peekTimer: ReturnType<typeof setTimeout> | null = null;
  function onWindowMove(e: PointerEvent) {
    if (!card || !dnd.draggingId || !panelEl) return;
    const dragged = store.card(dnd.draggingId);
    if (!dragged || dragged.parentId !== card.id) return;
    if (dnd.peek) return; // once the popup has stepped aside it stays aside until the drop
    const r = panelEl.getBoundingClientRect();
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

{#if card}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="backdrop" class:peek={dnd.peek} onclick={onBackdrop}>
    <div class="popup px" class:peek={dnd.peek} bind:this={panelEl} role="dialog" aria-label={card.title}>
      <nav class="crumbs">
        <button class="btn ghost sm" onclick={() => store.clearFocus()}>Board</button>
        {#each crumbs as c, i (c.id)}
          <span class="sep">›</span>
          {#if i < crumbs.length - 1}
            <button class="btn ghost sm" onclick={() => store.focus(c.id)}>{c.title || 'untitled'}</button>
          {:else}
            <span class="here">{c.title || 'untitled'}</span>
          {/if}
        {/each}
        <span class="spacer"></span>
        {#if !isPerson}<span class="hint">Drag a sub-todo out of this window and hold to place it on the board</span>{/if}
        <button class="btn sm" onclick={() => store.popFocus()}>close <span class="kbd">esc</span></button>
      </nav>

      <div class="top">
        <div class="stack" style:--n={ancestors.length}>
          {#each ancestors as a, i (a.id)}
            <button class="stackcard kind-{a.kind}" style:--i={ancestors.length - i} style:--r="{i % 2 === 0 ? -3 : 2.5}deg" onclick={() => store.focus(a.id)} title="Back to {a.title}">
              <span class="stackcard-title">{a.title || 'untitled'}</span>
            </button>
          {/each}
          <div class="sheet kind-{card.kind}" class:done={card.doneAt != null}>
            {#if isPerson}<div class="pin"></div>{/if}
            <textarea class="title" rows="1" use:autosize bind:value={titleDraft} onblur={saveTitle} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } e.stopPropagation(); }} placeholder={isPerson ? 'Name' : 'What needs doing?'}></textarea>
            {#if !isPerson}
              <div class="notes-wrap" class:scrollable={notesScrollable && !notesAtEnd}>
                <textarea
                  bind:this={notesEl}
                  class="notes"
                  rows="2"
                  use:autosize
                  bind:value={notesDraft}
                  oninput={checkNotesScroll}
                  onscroll={checkNotesScroll}
                  onblur={saveNotes}
                  onkeydown={(e) => e.stopPropagation()}
                  placeholder="Notes, links, - bullets…"
                ></textarea>
                {#if notesScrollable}<div class="scroll-hint">{notesAtEnd ? '' : '⌄ more'}</div>{/if}
              </div>
            {/if}
            <div class="meta">
              <span class="badge kind">{card.kind}</span>
              {#if bucket}<span class="badge">{bucket.name}</span>{/if}
              <span class="age" title="Created {new Date(card.createdAt).toLocaleDateString()}">{days === 0 ? 'created today' : `${days}d old`}{#if stale}, {STALE_LABELS[stale]}{/if}</span>
            </div>
          </div>
        </div>

        <div class="side">
          {#if !isPerson}
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
            <div class="row">
              <span class="lbl">When</span>
              <select value={card.bucketId ?? 'inherit'} onchange={(e) => setBucket((e.target as HTMLSelectElement).value)}>
                {#if card.parentId}<option value="inherit">Inherits ({parent ? store.bucketOf(parent)?.name ?? 'parent' : 'parent'})</option>{/if}
                {#each timeBuckets as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
                {#if ideasBucket}<option value={ideasBucket.id}>{ideasBucket.name}</option>{/if}
              </select>
            </div>
            <div class="row">
              <span class="lbl">Tags</span>
              <div class="chips">
                {#each card.tags as t (t)}
                  <span class="chip tag">#{t} <button class="x" onclick={() => removeTag(t)} title="Remove">✕</button></span>
                {/each}
                <input class="mini" placeholder="+ tag" bind:value={tagText} list="claydo-tags" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } e.stopPropagation(); }} onblur={addTag} />
                <datalist id="claydo-tags">{#each store.tags as t}<option value={t}></option>{/each}</datalist>
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
                <input class="mini" placeholder="+ person" bind:value={personPick} list="claydo-people" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } e.stopPropagation(); }} onblur={addPerson} />
                <datalist id="claydo-people">{#each otherPeople as p}<option value={p.title}></option>{/each}</datalist>
              </div>
            </div>
          {/if}
          {#if parent}
            <div class="row">
              <span class="lbl">Part of</span>
              <button class="btn sm" onclick={() => store.focus(parent.id)}>↰ {parent.title || 'untitled'}</button>
            </div>
          {/if}
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
              <div class="item">
                <input type="checkbox" onchange={() => store.requestComplete(item.id)} title="Done" />
                <button class="item-title" onclick={() => store.focus(item.id)}>{item.title}</button>
                {#if item.bucketId}<span class="badge small">{store.bucketOf(item)?.name}</span>{/if}
              </div>
            {/each}
            {#each mentions as m (m.id)}
              <div class="item mention">
                <input type="checkbox" onchange={() => store.requestComplete(m.id)} title="Done" />
                <button class="item-title" onclick={() => store.focus(m.id)}>↗ {m.title}</button>
                <span class="badge small">{store.bucketOf(m)?.name ?? ''}</span>
              </div>
            {/each}
            {#if open.length + mentions.length === 0}<div class="empty">Nothing queued up.</div>{/if}
          </div>
          <input bind:this={addInput} class="add" placeholder="Add to agenda… (↵)" bind:value={addText} onkeydown={(e) => { if (e.key === 'Enter') submitChild(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
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
            <input bind:this={addInput} class="add" placeholder="Add a sub-todo… (@person #tag !effort >today)" bind:value={addText} onkeydown={(e) => { if (e.key === 'Enter') submitChild(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
          </div>
          <div class="trays">
            <section class="mini" class:over={dnd.overDropKey === 'inherit' && dnd.intent === 'none'}>
              <header><h4 class="display">Inherits</h4><span class="sub">{bucket ? bucket.name : 'parent'}</span><span class="count">{inherited.length}</span></header>
              <div class="flow" data-drop="inherit">
                {#each inherited as k (k.id)}
                  <Card card={k} layout="flow" dropKey="inherit" showParent={false} />
                {/each}
                {#if inherited.length === 0}<div class="empty">nothing scheduled separately</div>{/if}
              </div>
            </section>
            {#each [...timeBuckets, ...(ideasBucket ? [ideasBucket] : [])] as b (b.id)}
              {@const here = open.filter((k) => k.bucketId === b.id)}
              <section class="mini kind-{b.kind}" class:over={dnd.overDropKey === `bucket:${b.id}` && dnd.intent === 'none'}>
                <header><h4 class="display">{b.name}</h4><span class="count">{here.length}</span></header>
                <div class="flow" data-drop="bucket:{b.id}">
                  {#each here as k (k.id)}
                    <Card card={k} layout="flow" dropKey="bucket:{b.id}" showParent={false} />
                  {/each}
                </div>
              </section>
            {/each}
          </div>
          {#if doneKids.length}
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
    transition:
      background 160ms,
      backdrop-filter 160ms;
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
  .popup {
    width: min(1100px, 100%);
    background: var(--bg);
    padding: 12px 16px 16px;
    animation: pop-in 200ms var(--ease-snap);
  }
  .popup.peek {
    visibility: hidden;
  }
  :global(.popup.peek .card[data-drag='dragging']) {
    visibility: visible;
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .sep {
    color: var(--ink-faint);
  }
  .here {
    font-weight: 700;
    padding: 0 6px;
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
    gap: 20px;
    align-items: start;
    margin-bottom: 16px;
  }
  @media (max-width: 760px) {
    .top {
      grid-template-columns: 1fr;
    }
  }
  .stack {
    position: relative;
    padding-top: calc(var(--n) * 6px);
    padding-left: calc(var(--n) * 6px);
  }
  .stackcard {
    position: absolute;
    inset: calc(var(--n) * 6px) 0 0 calc(var(--n) * 6px);
    transform: translate(calc(var(--i) * -9px), calc(var(--i) * -9px)) rotate(var(--r));
    border: var(--border) solid var(--line);
    border-radius: var(--radius);
    background: var(--paper-2);
    box-shadow: 3px 3px 0 var(--shadow);
    cursor: pointer;
    padding: 8px 10px;
    text-align: left;
    color: #6b5f4d;
    font-weight: 700;
    font-size: 12px;
    overflow: hidden;
    z-index: 0;
    transition: transform 140ms var(--ease-out);
  }
  .stackcard.kind-person {
    background: var(--paper-person);
    border-radius: 10px;
  }
  .stackcard:hover {
    transform: translate(calc(var(--i) * -9px - 4px), calc(var(--i) * -9px - 4px)) rotate(var(--r));
    color: #2b2418;
  }
  .stackcard-title {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60%;
  }
  .sheet {
    position: relative;
    z-index: 1;
    background: var(--paper);
    border: var(--border) solid var(--line);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--shadow);
    padding: 12px 14px;
    color: #2b2418;
    min-height: 120px;
  }
  .sheet.kind-person {
    background: var(--paper-person);
    border-radius: 10px;
    padding-top: 16px;
  }
  .sheet.kind-idea {
    background: var(--paper-idea);
    border-style: dashed;
  }
  .sheet.done {
    background: #ecf7ea;
  }
  .pin {
    position: absolute;
    top: -8px;
    left: 50%;
    width: 14px;
    height: 14px;
    margin-left: -7px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--line);
  }
  .title {
    width: 100%;
    resize: none;
    border: 0;
    border-bottom: 1.5px dashed rgba(43, 36, 24, 0.3);
    background: transparent;
    outline: none;
    font-weight: 700;
    font-size: 17px;
    line-height: 1.25;
    padding: 0 0 4px;
    overflow: hidden;
    color: #2b2418;
  }
  .title:focus {
    border-bottom-color: var(--accent);
  }
  .notes-wrap {
    position: relative;
    margin-top: 8px;
  }
  .notes {
    width: 100%;
    max-height: 260px;
    overflow-y: auto;
    resize: none;
    border: 0;
    background: transparent;
    outline: none;
    font-size: 13px;
    line-height: 1.4;
    color: #4b4232;
    padding: 0;
  }
  .notes-wrap.scrollable::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 34px;
    background: linear-gradient(to bottom, transparent, var(--paper));
    pointer-events: none;
  }
  .scroll-hint {
    position: absolute;
    right: 4px;
    bottom: 2px;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--accent);
    pointer-events: none;
    z-index: 1;
  }
  .meta {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 10px;
    font-size: 11px;
    color: #6b5f4d;
  }
  .badge {
    background: rgba(43, 36, 24, 0.1);
    border-radius: 3px;
    padding: 2px 6px;
    font-weight: 700;
  }
  .badge.kind {
    background: #2b2418;
    color: var(--paper);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10px;
  }
  .badge.small {
    font-size: 10px;
    background: var(--accent-2);
    color: #fff;
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
    border: 1.5px solid var(--tray-line);
    border-radius: 4px;
    background: #fff;
    color: #2b2418;
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
    border: 1.5px dashed var(--tray-line);
    border-radius: 4px;
    background: transparent;
    font-size: 12px;
    outline: none;
  }
  .mini:focus {
    border-style: solid;
    border-color: var(--accent);
    background: #fff;
    color: #2b2418;
  }
  .actions {
    margin-top: 4px;
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
    background: #fff;
    color: #2b2418;
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
    background: rgba(255, 255, 255, 0.5);
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
  .item.mention .item-title {
    color: #1f5aa8;
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
