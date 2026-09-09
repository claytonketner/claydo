<script lang="ts">
  import { hash01 } from '../model/ids';
  import { staleStage, STALE_LABELS } from '../model/staleness';
  import { store } from '../model/store.svelte';
  import { CARD_W, type Card } from '../model/types';
  import { draggable, type DragBounds } from '../physics/drag';
  import Chips from './Chips.svelte';
  import NotesView from './NotesView.svelte';
  import { beginDrag, dnd, endDrag, resolveDrop, trackDrag } from './dnd.svelte';
  import { autosize, measureCard, ui } from './ui.svelte';

  interface Props {
    card: Card;
    /** free = absolutely positioned in a tray; flow = normal flow in a column */
    layout?: 'free' | 'flow';
    /** drop key of the container, so a same-tray drop just coasts */
    dropKey?: string | null;
    /** max x for free layout, so cards don't hang off a narrow tray */
    maxX?: number;
    showParent?: boolean;
  }
  let { card, layout = 'free', dropKey = null, maxX = Infinity, showParent = true }: Props = $props();

  let node: HTMLElement;
  let coasting = false;
  let expanded = $state(false);
  let agendaInput = $state<HTMLInputElement | null>(null);
  let agendaDraft = $state('');
  let titleDraft = $state('');
  let notesDraft = $state('');
  let titleEl = $state<HTMLTextAreaElement | null>(null);
  let notesEl = $state<HTMLTextAreaElement | null>(null);

  const selected = $derived(store.selectedId === card.id);
  const editing = $derived(store.editingId === card.id);
  const isDragging = $derived(dnd.draggingId === card.id);
  const nestTarget = $derived(dnd.overCardId === card.id);
  const kids = $derived(store.childrenOf(card.id));
  const openKids = $derived(kids.filter((k) => k.doneAt == null));
  const parent = $derived(card.parentId ? store.card(card.parentId) : null);
  const bucket = $derived(store.bucketOf(card));
  const stale = $derived(card.kind === 'todo' && bucket?.kind === 'time' ? staleStage(card.touchedAt) : 0);
  const rot = $derived((hash01(card.id) * 3 - 1.5).toFixed(2));
  const x = $derived(Math.min(card.pos.x, Math.max(0, maxX)));
  const mentions = $derived(card.kind === 'person' ? store.mentionsOf(card.id) : []);
  const recentlyDone = $derived(
    card.kind === 'person' ? kids.filter((k) => k.doneAt != null && Date.now() - k.doneAt < 14 * 86_400_000).sort((a, b) => b.doneAt! - a.doneAt!) : []
  );
  const justDone = $derived(store.lastCompletedId === card.id);

  $effect(() => {
    if (editing) {
      titleDraft = card.title;
      notesDraft = card.notes;
      requestAnimationFrame(() => {
        titleEl?.focus();
        titleEl?.select();
      });
    }
  });
  $effect(() => {
    if (ui.wantAgendaFocusId === card.id) {
      expanded = true;
      ui.wantAgendaFocusId = null;
      requestAnimationFrame(() => agendaInput?.focus());
    }
  });

  function commitEdit() {
    if (!editing) return;
    const title = titleDraft.trim();
    const notes = notesDraft.replace(/\s+$/, '');
    if (title !== card.title || notes !== card.notes) {
      store.updateCard(card.id, { title, notes });
    }
    if (!title && !notes && kids.length === 0) store.deleteCard(card.id);
    store.editingId = null;
  }
  function cancelEdit() {
    if (!card.title && !card.notes && kids.length === 0) store.deleteCard(card.id);
    store.editingId = null;
  }
  function onTitleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      notesEl?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
    e.stopPropagation();
  }
  function onNotesKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      titleEl?.focus();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      promoteLine();
    }
    e.stopPropagation();
  }
  /** ⌘Enter in notes: turn the current line into a real sub-todo. */
  function promoteLine() {
    if (!notesEl) return;
    const pos = notesEl.selectionStart;
    const lines = notesDraft.split('\n');
    let acc = 0;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (pos <= acc + lines[i].length) {
        idx = i;
        break;
      }
      acc += lines[i].length + 1;
      idx = i;
    }
    const title = lines[idx].replace(/^\s*[-*]\s+/, '').trim();
    if (!title) return;
    lines.splice(idx, 1);
    notesDraft = lines.join('\n');
    store.updateCard(card.id, { notes: notesDraft }, { label: 'promote line' });
    store.addCard({ title, parentId: card.id, bucketId: null }, { select: false });
    store.showToast(`Made sub-todo: ${title}`);
  }
  function onBlurEditor(e: FocusEvent) {
    const next = e.relatedTarget as HTMLElement | null;
    if (next && node.contains(next)) return;
    commitEdit();
  }

  function onClick(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, .no-drag')) return;
    if (editing) return;
    if (selected && target.closest('.title, .notes-preview')) {
      store.editingId = card.id;
      return;
    }
    if (card.kind === 'person') {
      expanded = selected ? !expanded : true;
      if (expanded) requestAnimationFrame(() => agendaInput?.focus());
    }
    store.selectedId = card.id;
    store.editingId = null;
  }
  function onDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, .no-drag')) return;
    store.selectedId = card.id;
    if (card.kind !== 'person' || target.closest('.title')) store.editingId = card.id;
  }

  function addChild() {
    if (card.kind === 'person') {
      expanded = true;
      store.selectedId = card.id;
      requestAnimationFrame(() => agendaInput?.focus());
    } else {
      ui.wantFocusAdd = true;
      store.focus(card.id);
    }
  }
  function submitAgenda() {
    const t = agendaDraft.trim();
    if (!t) return;
    store.quickAdd(t, { parentId: card.id });
    agendaDraft = '';
  }

  const dragOpts = $derived({
    enabled: () => !editing,
    ignore: 'input, textarea, button, a, .no-drag',
    onStart: () => {
      store.selectedId = card.id;
      store.editingId = null;
      beginDrag(card.id);
      return true;
    },
    onMove: (_pos: { x: number; y: number }, e: PointerEvent) => trackDrag(e, node),
    onRelease: (_pos: { x: number; y: number }, _v: { vx: number; vy: number }, e: PointerEvent): DragBounds | null => {
      const bounds = resolveDrop(card.id, node, e, { currentDropKey: dropKey, free: layout === 'free' });
      endDrag();
      coasting = bounds != null;
      return bounds;
    },
    onSettle: (pos: { x: number; y: number }) => {
      if (coasting && layout === 'free') store.setPos(card.id, pos);
      coasting = false;
    },
    onClick
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={node}
  use:draggable={dragOpts}
  use:measureCard={card.id}
  class="card kind-{card.kind} stale-{stale} layout-{layout}"
  class:selected
  class:editing
  class:expanded
  class:nest-target={nestTarget}
  class:is-dragging={isDragging}
  class:just-done={justDone}
  class:has-color={!!card.color}
  style:--rot="{rot}deg"
  style:left={layout === 'free' ? `${x}px` : undefined}
  style:top={layout === 'free' ? `${card.pos.y}px` : undefined}
  style:--paper-custom={card.color ?? undefined}
  data-card={card.id}
  ondblclick={onDblClick}
  onpointerenter={() => (ui.hoveredId = card.id)}
  onpointerleave={() => (ui.hoveredId = ui.hoveredId === card.id ? null : ui.hoveredId)}
  title={stale ? `Untouched for ${STALE_LABELS[stale]}` : undefined}
>
  {#if card.kind === 'person'}
    <div class="pin"></div>
  {/if}

  <div class="tools no-drag">
    {#if card.kind !== 'person'}
      <button class="tool done" title="Mark done (D)" onclick={() => store.complete(card.id)}>✓</button>
    {/if}
    <button class="tool del" title="Delete" onclick={() => store.deleteCard(card.id)}>✕</button>
  </div>

  {#if editing}
    <textarea
      bind:this={titleEl}
      class="title-input"
      rows="1"
      use:autosize
      bind:value={titleDraft}
      onkeydown={onTitleKey}
      onblur={onBlurEditor}
      placeholder={card.kind === 'person' ? 'Name' : 'What needs doing?'}
    ></textarea>
    <textarea
      bind:this={notesEl}
      class="notes-input"
      rows="1"
      use:autosize
      bind:value={notesDraft}
      onkeydown={onNotesKey}
      onblur={onBlurEditor}
      placeholder="Notes, links, - bullets (⌘↵ makes a sub-todo)"
    ></textarea>
  {:else}
    <div class="title">{card.title || '(untitled)'}</div>
    {#if card.notes && card.kind !== 'person'}
      <div class="notes-preview">
        <NotesView text={card.notes} clamp={selected ? 0 : 2} />
      </div>
    {/if}
  {/if}

  {#if card.kind === 'person'}
    <button class="agenda-toggle no-drag" onclick={() => (expanded = !expanded)}>
      {openKids.length + mentions.length} to discuss {expanded ? '▴' : '▾'}
    </button>
    {#if expanded}
      <div class="agenda no-drag">
        {#each openKids as item (item.id)}
          <label class="item">
            <input type="checkbox" onchange={() => store.complete(item.id)} />
            <span
              class="item-title"
              role="button"
              tabindex="-1"
              ondblclick={() => {
                store.selectedId = item.id;
                store.editingId = item.id;
              }}>{item.title}</span
            >
            {#if item.bucketId}<span class="item-bucket">{store.card(item.id) && store.bucketOf(item)?.name}</span>{/if}
          </label>
        {/each}
        {#each mentions as m (m.id)}
          <label class="item mention">
            <input type="checkbox" onchange={() => store.complete(m.id)} />
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <span class="item-title" role="button" tabindex="-1" onclick={() => (store.selectedId = m.id)}>↗ {m.title}</span>
          </label>
        {/each}
        <input
          bind:this={agendaInput}
          class="agenda-add"
          placeholder="Add to agenda… (↵)"
          bind:value={agendaDraft}
          onkeydown={(e) => {
            if (e.key === 'Enter') submitAgenda();
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
        />
        {#if recentlyDone.length}
          <details class="recent">
            <summary>recently discussed ({recentlyDone.length})</summary>
            {#each recentlyDone as d (d.id)}
              <div class="done-item">
                <span>✓ {d.title}</span>
                <button class="relink" title="Reopen" onclick={() => store.reopen(d.id)}>↺</button>
              </div>
            {/each}
          </details>
        {/if}
      </div>
    {/if}
  {/if}

  {#if card.kind !== 'person' && (selected || card.effort != null || card.value != null || card.tags.length || card.peopleIds.length)}
    <div class="foot no-drag">
      <Chips {card} editable={selected} />
    </div>
  {/if}

  {#if kids.length && card.kind !== 'person'}
    <button class="kids no-drag" title="Focus on sub-todos (F)" onclick={() => store.focus(card.id)}>
      {kids.length - openKids.length}/{kids.length} ▸
    </button>
  {/if}
  {#if parent && showParent}
    <button class="parent-chip no-drag" title="Part of: {parent.title}" onclick={() => store.focus(parent.id)}>↑ {parent.title}</button>
  {/if}
  {#if card.parentId && card.bucketId && bucket && showParent === false}
    <span class="sched-chip">{bucket.name}</span>
  {/if}

  <button class="add-child no-drag" title={card.kind === 'person' ? 'Add agenda item' : 'Add sub-todo'} onclick={addChild}>+</button>

  {#if stale >= 2}
    <svg class="cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 30 L14 34 L22 26 L31 40" />
      <path d="M96 12 L88 24 L92 36" />
      {#if stale >= 3}
        <path d="M60 98 L64 84 L58 76 L70 66" />
        <path d="M4 70 L10 74 L8 84" />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .card {
    --paper-now: var(--paper);
    position: absolute;
    width: 150px;
    min-height: 60px;
    padding: 8px 9px 8px;
    background: var(--paper-custom, var(--paper-now));
    color: #2b2418;
    border: var(--border) solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--shadow);
    transform: rotate(var(--rot));
    transform-origin: 50% 50%;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    transition:
      box-shadow 120ms var(--ease-out),
      background 200ms,
      width 160ms var(--ease-out);
    animation: pop-in 220ms var(--ease-snap);
    will-change: transform;
  }
  .card.layout-flow {
    position: relative;
    flex: 0 0 auto;
  }
  .card.stale-1 {
    --paper-now: var(--paper-stale-1);
  }
  .card.stale-2 {
    --paper-now: var(--paper-stale-2);
  }
  .card.stale-3 {
    --paper-now: var(--paper-stale-3);
  }
  .card.kind-person {
    --paper-now: var(--paper-person);
    border-radius: 10px;
    text-align: center;
    padding-top: 12px;
  }
  .card.kind-idea {
    --paper-now: var(--paper-idea);
    border-style: dashed;
  }
  .card:hover {
    transform: rotate(0deg) translateY(-1px);
    box-shadow: 4px 4px 0 var(--shadow);
    z-index: 5;
  }
  .card.selected {
    transform: rotate(0deg);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    z-index: 6;
  }
  .card.editing {
    cursor: text;
    width: 220px;
    z-index: 8;
  }
  .card.expanded {
    width: 250px;
    text-align: left;
    z-index: 7;
  }
  :global(.card.dragging),
  :global(.card.coasting) {
    z-index: 100;
    cursor: grabbing;
    transition: none;
    animation: none;
  }
  :global(.card.dragging) {
    box-shadow: 7px 9px 0 rgba(43, 36, 24, 0.55);
    scale: 1.04;
    rotate: 0deg;
  }
  .card.nest-target {
    outline: 3px dashed var(--accent-2);
    outline-offset: 3px;
    background: #fff;
    scale: 1.05;
  }
  .card.just-done {
    animation: pop-in 200ms var(--ease-snap) reverse;
  }

  .pin {
    position: absolute;
    top: -7px;
    left: 50%;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--line);
    box-shadow: 1px 1px 0 var(--shadow);
  }

  .title {
    font-weight: 650;
    font-size: 12.5px;
    line-height: 1.25;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .kind-person .title {
    font-size: 14px;
  }
  .selected .title,
  .selected .notes-preview {
    cursor: text;
  }
  .notes-preview {
    margin-top: 4px;
  }
  .title-input,
  .notes-input {
    display: block;
    width: 100%;
    resize: none;
    border: 0;
    border-bottom: 1.5px dashed rgba(43, 36, 24, 0.3);
    background: transparent;
    padding: 0 0 2px;
    outline: none;
    overflow: hidden;
    font-weight: 650;
    font-size: 12.5px;
    line-height: 1.25;
  }
  .notes-input {
    margin-top: 5px;
    font-weight: 400;
    font-size: 11.5px;
    color: #4b4232;
    border-bottom: 0;
  }
  .foot {
    margin-top: 6px;
  }

  .tools {
    position: absolute;
    top: -9px;
    right: -6px;
    display: flex;
    gap: 3px;
    opacity: 0;
    transition: opacity 100ms;
  }
  .card:hover .tools,
  .card.selected .tools {
    opacity: 1;
  }
  .tool {
    width: 18px;
    height: 18px;
    border: 2px solid var(--line);
    border-radius: 4px;
    background: #fff;
    color: #2b2418;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    box-shadow: 1px 1px 0 var(--shadow);
    padding: 0;
  }
  .tool.done:hover {
    background: var(--done);
  }
  .tool.del:hover {
    background: var(--over);
    color: #fff;
  }
  .tool:active {
    transform: translate(1px, 1px);
    box-shadow: none;
  }

  .kids {
    margin-top: 6px;
    border: 1.5px solid var(--line);
    border-radius: 4px;
    background: #2b2418;
    color: var(--paper);
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
  }
  .kids:hover {
    background: var(--accent);
    color: #fff;
  }
  .parent-chip {
    display: block;
    margin-top: 5px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    background: rgba(43, 36, 24, 0.08);
    border-radius: 3px;
    font-size: 10px;
    color: #4b4232;
    padding: 2px 5px;
    cursor: pointer;
    text-align: left;
  }
  .parent-chip:hover {
    background: rgba(43, 36, 24, 0.16);
  }
  .sched-chip {
    display: inline-block;
    margin-top: 5px;
    font-size: 10px;
    padding: 2px 5px;
    border-radius: 3px;
    background: var(--accent-2);
    color: #fff;
    font-weight: 700;
  }

  .add-child {
    position: absolute;
    left: 50%;
    bottom: -10px;
    width: 20px;
    height: 20px;
    margin-left: -10px;
    border: 2px solid var(--line);
    border-radius: 50%;
    background: var(--paper);
    color: #2b2418;
    font-weight: 900;
    font-size: 13px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    box-shadow: 1px 1px 0 var(--shadow);
    opacity: 0;
    transform: scale(0.6);
    transition:
      opacity 100ms,
      transform 140ms var(--ease-snap);
  }
  .card:hover .add-child,
  .card.selected .add-child {
    opacity: 1;
    transform: scale(1);
  }
  .add-child:hover {
    background: var(--accent);
    color: #fff;
  }

  /* person agenda */
  .agenda-toggle {
    margin-top: 6px;
    border: 0;
    background: rgba(43, 36, 24, 0.1);
    border-radius: 3px;
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 6px;
    cursor: pointer;
    color: #2b2418;
  }
  .agenda {
    margin-top: 8px;
    border-top: 1.5px dashed rgba(43, 36, 24, 0.3);
    padding-top: 6px;
    cursor: default;
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 12px;
    padding: 2px 0;
  }
  .item input {
    margin: 2px 0 0;
    accent-color: var(--done);
  }
  .item-title {
    flex: 1;
    cursor: text;
  }
  .item.mention .item-title {
    color: #1f5aa8;
    cursor: pointer;
  }
  .item-bucket {
    font-size: 9.5px;
    background: var(--accent-2);
    color: #fff;
    border-radius: 3px;
    padding: 1px 4px;
    font-weight: 700;
  }
  .agenda-add {
    width: 100%;
    margin-top: 4px;
    border: 1.5px solid rgba(43, 36, 24, 0.3);
    border-radius: 4px;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    outline: none;
  }
  .agenda-add:focus {
    border-color: var(--accent);
    background: #fff;
  }
  .recent {
    margin-top: 6px;
    font-size: 11px;
    color: #4b4232;
  }
  .recent summary {
    cursor: pointer;
    color: #6b5f4d;
  }
  .done-item {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding: 1px 0;
    text-decoration: line-through;
    opacity: 0.75;
  }
  .relink {
    border: 0;
    background: none;
    cursor: pointer;
    padding: 0 3px;
  }

  .cracks {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    fill: none;
    stroke: rgba(43, 36, 24, 0.45);
    stroke-width: 0.8;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
</style>
