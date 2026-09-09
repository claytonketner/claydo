<script lang="ts">
  import { untrack } from 'svelte';
  import { hash01 } from '../model/ids';
  import { staleStage, STALE_LABELS } from '../model/staleness';
  import { store } from '../model/store.svelte';
  import type { Card } from '../model/types';
  import { draggable } from '../physics/drag';
  import Chips from './Chips.svelte';
  import NotesView from './NotesView.svelte';
  import { beginDrag, dnd, endDrag, resolveDrop, trackDrag } from './dnd.svelte';
  import { autosize, measureCard, ui } from './ui.svelte';

  interface Props {
    card: Card;
    /** free = absolutely positioned in a tray; flow = normal flow in a column */
    layout?: 'free' | 'flow';
    /** drop key of the container, so a same-tray drop just re-positions */
    dropKey?: string | null;
    /** max x for free layout, so cards don't hang off a narrow tray */
    maxX?: number;
    /** override the y position (done timeline) */
    y?: number | null;
    showParent?: boolean;
    /** Inside the detail popup: wider, full notes, click-to-edit, no drag. */
    popup?: boolean;
  }
  let { card, layout = 'free', dropKey = null, maxX = Infinity, y = null, showParent = true, popup = false }: Props = $props();

  let node: HTMLElement;
  let clipped = $state(false);
  let localEditing = $state(false);
  let titleDraft = $state('');
  let notesDraft = $state('');
  let titleEl = $state<HTMLTextAreaElement | null>(null);
  let notesEl = $state<HTMLTextAreaElement | null>(null);

  const selected = $derived(!popup && store.selectedId === card.id);
  const editing = $derived(popup ? localEditing : store.editingId === card.id);
  const done = $derived(card.doneAt != null);
  const groupTarget = $derived(dnd.overCardId === card.id && dnd.intent === 'group');
  const nestTarget = $derived(dnd.overCardId === card.id && dnd.intent === 'nest');
  const kids = $derived(store.childrenOf(card.id));
  const openKids = $derived(kids.filter((k) => k.doneAt == null));
  const parent = $derived(card.parentId ? store.card(card.parentId) : null);
  const bucket = $derived(store.bucketOf(card));
  const stale = $derived(card.kind === 'todo' && !done && bucket?.kind === 'time' ? staleStage(card.createdAt) : 0);
  const rot = $derived(popup ? '0' : (hash01(card.id) * 3 - 1.5).toFixed(2));
  const x = $derived(Math.min(card.pos.x, Math.max(0, maxX)));
  const top = $derived(y ?? card.pos.y);
  const mentions = $derived(card.kind === 'person' ? store.mentionsOf(card.id) : []);
  const cluster = $derived(card.clusterId ? store.clusterOf(card.id) : null);
  // svelte-ignore state_referenced_locally
  const fresh = !popup && Date.now() - card.createdAt < 1500;

  // Load drafts when editing starts; save whatever was typed when it ends for any reason.
  let wasEditing = false;
  $effect(() => {
    if (editing) {
      if (!wasEditing) {
        wasEditing = true;
        untrack(() => {
          titleDraft = card.title;
          notesDraft = card.notes;
        });
        requestAnimationFrame(() => {
          titleEl?.focus();
          titleEl?.select();
        });
      }
    } else if (wasEditing) {
      wasEditing = false;
      untrack(saveDrafts);
    }
  });

  /** Watch whether the card's content is taller than its max height. */
  function clipWatch(el: HTMLElement) {
    const check = () => (clipped = !popup && el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return { destroy: () => ro.disconnect() };
  }

  function saveDrafts() {
    const title = titleDraft.trim();
    const notes = notesDraft.replace(/\s+$/, '');
    const live = store.card(card.id);
    if (!live) return;
    if (title !== live.title || notes !== live.notes) store.updateCard(card.id, { title, notes });
    if (!popup && !title && !notes && kids.length === 0) store.deleteCard(card.id);
  }
  function startEdit() {
    if (done) return;
    if (popup) localEditing = true;
    else store.editingId = card.id;
  }
  function finishEdit() {
    if (popup) localEditing = false;
    else if (store.editingId === card.id) store.editingId = null;
  }
  function onTitleKey(e: KeyboardEvent) {
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
      e.preventDefault();
      finishEdit();
    } else if (e.key === 'Tab' && !e.shiftKey && card.kind !== 'person') {
      e.preventDefault();
      notesEl?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finishEdit();
    }
    e.stopPropagation();
  }
  function onNotesKey(e: KeyboardEvent) {
    if (e.key === 'Escape' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      finishEdit();
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      titleEl?.focus();
    }
    e.stopPropagation();
  }
  function onBlurEditor(e: FocusEvent) {
    const next = e.relatedTarget as HTMLElement | null;
    if (next && node.contains(next) && next.tagName === 'TEXTAREA') return;
    finishEdit();
  }

  function onClick(e: PointerEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('a, button, input, textarea')) return;
    if (editing) return;
    if (popup) {
      startEdit();
      return;
    }
    store.selectedId = card.id;
    store.editingId = null;
  }
  function onDblClick(e: MouseEvent) {
    if (popup) return;
    if ((e.target as HTMLElement).closest('a, button, input, textarea')) return;
    if (editing) return;
    store.focus(card.id);
  }

  const dragOpts = $derived({
    enabled: () => !editing,
    ignore: 'input, textarea, button, a',
    onStart: () => {
      store.selectedId = card.id;
      store.editingId = null;
      beginDrag(card.id);
      return true;
    },
    onMove: (_pos: { x: number; y: number }, e: PointerEvent) => trackDrag(e, node),
    onRelease: (pos: { x: number; y: number }, e: PointerEvent) => {
      resolveDrop(card.id, node, pos, e, { currentDropKey: dropKey, free: layout === 'free' });
      endDrag();
      if (store.selectedId === card.id) store.selectedId = null;
    },
    onClick
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={node}
  use:draggable={dragOpts}
  use:measureCard={layout === 'free' && !popup ? card.id : null}
  class="card kind-{card.kind} stale-{stale} layout-{layout}"
  class:selected
  class:editing
  class:done
  class:fresh
  class:popup
  class:clipped
  class:group-target={groupTarget}
  class:nest-target={nestTarget}
  class:clustered={!!cluster}
  style:--rot="{rot}deg"
  style:--cluster={cluster?.color ?? undefined}
  style:left={layout === 'free' ? `${x}px` : undefined}
  style:top={layout === 'free' ? `${top}px` : undefined}
  style:--paper-custom={card.color ?? undefined}
  data-card={popup ? undefined : card.id}
  ondblclick={onDblClick}
  onpointerenter={() => (ui.hoveredId = card.id)}
  onpointerleave={() => (ui.hoveredId = ui.hoveredId === card.id ? null : ui.hoveredId)}
  title={stale && !popup ? `Created ${STALE_LABELS[stale]} ago` : undefined}
>
  {#if card.kind === 'person'}
    <div class="pin"></div>
  {/if}

  {#if !popup}
    <div class="tools">
      {#if done}
        <button class="tool reopen" title="Reopen" onclick={() => store.reopen(card.id)}>↺</button>
      {:else if card.kind !== 'person'}
        <button class="tool done-btn" title="Mark done (D)" onclick={() => store.requestComplete(card.id)}>✓</button>
      {/if}
      <button class="tool del" title="Delete" onclick={() => store.requestDelete(card.id)}>✕</button>
    </div>
  {/if}

  <div class="content" use:clipWatch>
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
      {#if card.kind !== 'person'}
        <textarea bind:this={notesEl} class="notes-input" rows="1" use:autosize bind:value={notesDraft} onkeydown={onNotesKey} onblur={onBlurEditor} placeholder="Notes, links, - bullets"></textarea>
      {/if}
    {:else}
      <div class="title">{#if done}<span class="check">✓</span> {/if}{card.title || '(untitled)'}</div>
      {#if card.notes && card.kind !== 'person'}
        <div class="notes-preview">
          <NotesView text={card.notes} clamp={popup ? 0 : 4} />
        </div>
      {:else if popup && card.kind !== 'person'}
        <div class="notes-empty">click to add notes</div>
      {/if}
    {/if}

    {#if card.kind === 'person'}
      <div class="discuss">{openKids.length + mentions.length} to discuss</div>
    {/if}

    {#if card.kind !== 'person' && (selected || popup || card.effort != null || card.value != null || card.tags.length || card.peopleIds.length)}
      <div class="foot">
        <Chips {card} editable={(selected || popup) && !done} />
      </div>
    {/if}

    {#if !popup}
      <div class="links">
        {#if kids.length && card.kind !== 'person'}
          <button class="kids" title="Open sub-todos" onclick={() => store.focus(card.id)}>
            <span class="arrow">↴</span> {kids.length - openKids.length}/{kids.length}
          </button>
        {/if}
        {#if parent && showParent}
          <button class="parent-chip" title="Part of: {parent.title}" onclick={() => store.focus(parent.id)}><span class="arrow">↰</span> {parent.title}</button>
        {/if}
        {#if card.parentId && card.bucketId && bucket && showParent === false}
          <span class="sched-chip">{bucket.name}</span>
        {/if}
      </div>
    {/if}
    {#if clipped}<div class="clip-fade" title="More inside, double-click to open">⋯</div>{/if}
  </div>

  {#if !done && !popup}
    <button
      class="add-child"
      title={card.kind === 'person' ? 'Add agenda item' : 'Add sub-todo'}
      onclick={() => {
        ui.wantFocusAdd = true;
        store.focus(card.id);
      }}>+</button
    >
  {/if}

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
      width 160ms var(--ease-out),
      scale 140ms var(--ease-out);
    will-change: transform;
  }
  .content {
    position: relative;
    max-height: 172px;
    overflow: hidden;
  }
  .card.fresh {
    animation: pop-in 220ms var(--ease-snap);
  }
  .card.layout-flow {
    position: relative;
    flex: 0 0 auto;
  }
  .card.popup {
    width: 100%;
    cursor: text;
    padding: 12px 14px;
  }
  .card.popup .content {
    max-height: none;
    overflow: visible;
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
  .card.done {
    --paper-now: #ecf7ea;
    opacity: 0.9;
    border-color: rgba(43, 36, 24, 0.55);
  }
  .card.done .content {
    max-height: 60px;
  }
  .card.done .title {
    color: #4b5d48;
  }
  .check {
    color: #2f9a3a;
    font-weight: 900;
  }
  .card:not(.popup):hover {
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
  .card.editing:not(.popup) {
    cursor: text;
    width: 220px;
    z-index: 8;
  }
  .card.editing .content {
    max-height: none;
    overflow: visible;
  }
  /* :global so Svelte doesn't prune the selector (the attribute is set by the drag action, not the template). */
  .card:global([data-drag='dragging']) {
    z-index: 100 !important;
    cursor: grabbing;
    transition: none;
    animation: none;
    box-shadow: 7px 9px 0 rgba(43, 36, 24, 0.55);
    scale: 1.04;
    rotate: 0deg;
  }
  .card:global([data-drag='dropped']) {
    z-index: 100 !important;
    animation: land 320ms var(--ease-snap);
  }
  @keyframes land {
    0% {
      scale: 1.04;
      box-shadow: 7px 9px 0 rgba(43, 36, 24, 0.55);
    }
    45% {
      scale: 0.97;
      box-shadow: 2px 2px 0 var(--shadow);
    }
    75% {
      scale: 1.015;
    }
    100% {
      scale: 1;
      box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--shadow);
    }
  }
  .card.group-target {
    outline: 2px dashed var(--accent-2);
    outline-offset: 4px;
  }
  .card.nest-target {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
    background: #fff;
    scale: 1.06;
    z-index: 7;
  }
  .card.clustered::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    background: var(--cluster);
    pointer-events: none;
    border-radius: 3px 0 0 3px;
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
  .popup .title {
    font-size: 16px;
  }
  .kind-person .title {
    font-size: 14px;
  }
  .popup.kind-person .title {
    font-size: 18px;
  }
  .notes-preview {
    margin-top: 4px;
  }
  .popup .notes-preview {
    margin-top: 8px;
    max-height: 260px;
    overflow-y: auto;
  }
  .popup .notes-preview :global(.notes) {
    font-size: 13px;
    line-height: 1.4;
  }
  .notes-empty {
    margin-top: 8px;
    font-size: 12px;
    color: #a2957f;
    font-style: italic;
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
    color: #2b2418;
  }
  .popup .title-input {
    font-size: 16px;
  }
  .notes-input {
    margin-top: 5px;
    font-weight: 400;
    font-size: 11.5px;
    color: #4b4232;
    border-bottom: 0;
  }
  .popup .notes-input {
    font-size: 13px;
    line-height: 1.4;
    max-height: 260px;
    overflow-y: auto;
  }
  .foot {
    margin-top: 6px;
  }
  .popup .foot {
    margin-top: 10px;
  }
  .discuss {
    margin-top: 6px;
    display: inline-block;
    background: rgba(43, 36, 24, 0.1);
    border-radius: 3px;
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 6px;
  }

  .tools {
    position: absolute;
    top: -9px;
    right: -6px;
    display: flex;
    gap: 3px;
    opacity: 0;
    transition: opacity 100ms;
    z-index: 2;
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
  .tool.done-btn:hover,
  .tool.reopen:hover {
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

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .links:not(:empty) {
    margin-top: 6px;
  }
  .arrow {
    font-size: 12px;
    line-height: 1;
  }
  .kids {
    border: 1.5px solid var(--line);
    border-radius: 4px;
    background: #2b2418;
    color: var(--paper);
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }
  .kids:hover {
    background: var(--accent);
    color: #fff;
  }
  .parent-chip {
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
    z-index: 2;
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

  .clip-fade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 26px;
    background: linear-gradient(to bottom, transparent, var(--paper-custom, var(--paper-now)) 65%);
    text-align: center;
    font-weight: 900;
    line-height: 30px;
    color: #6b5f4d;
    pointer-events: none;
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
