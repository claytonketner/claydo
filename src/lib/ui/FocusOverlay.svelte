<script lang="ts">
  import { store } from '../model/store.svelte';
  import Card from './Card.svelte';
  import { dnd } from './dnd.svelte';
  import { ui } from './ui.svelte';

  const parent = $derived(store.focused);
  const crumbs = $derived(store.focusStack.map((id) => store.card(id)).filter((c) => !!c));
  const kids = $derived(parent ? store.childrenOf(parent.id) : []);
  const open = $derived(kids.filter((k) => k.doneAt == null));
  const done = $derived(kids.filter((k) => k.doneAt != null).sort((a, b) => b.doneAt! - a.doneAt!));
  const inherited = $derived(open.filter((k) => k.bucketId == null));
  const parentBucket = $derived(parent ? store.bucketOf(parent) : null);
  const timeBuckets = $derived(store.timeBuckets);

  let addInput = $state<HTMLInputElement | null>(null);
  let addText = $state('');

  $effect(() => {
    if (parent && ui.wantFocusAdd) {
      ui.wantFocusAdd = false;
      requestAnimationFrame(() => addInput?.focus());
    }
  });

  function submit() {
    if (!parent) return;
    const t = addText.trim();
    if (!t) return;
    store.quickAdd(t, { parentId: parent.id });
    addText = '';
  }
  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) store.popFocus();
  }
  function onPanelClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-card], input, textarea, button, a')) return;
    store.selectedId = parent?.id ?? null;
    store.editingId = null;
  }
</script>

{#if parent}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={onBackdrop}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="panel px" onclick={onPanelClick}>
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
        <span class="hint">Drop a sub-todo on a tray to give it its own timeframe. <span class="kbd">esc</span> back</span>
      </nav>

      <div class="top">
        <div class="parent-wrap">
          <Card card={parent} layout="flow" dropKey={null} showParent={false} />
        </div>
        <div class="add">
          <input
            bind:this={addInput}
            bind:value={addText}
            placeholder="Add a sub-todo… (@person #tag !effort >today)"
            onkeydown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
              e.stopPropagation();
            }}
          />
          <div class="stats">
            {open.length} open · {done.length} done
          </div>
        </div>
      </div>

      <div class="trays">
        <section class="mini" class:over={dnd.overDropKey === 'inherit' && !dnd.nestIntent}>
          <header>
            <h3 class="display">Inherits</h3>
            <span class="sub">{parentBucket ? parentBucket.name : 'parent'}</span>
            <span class="count">{inherited.length}</span>
          </header>
          <div class="flow" data-drop="inherit">
            {#each inherited as k (k.id)}
              <Card card={k} layout="flow" dropKey="inherit" showParent={false} />
            {/each}
            {#if inherited.length === 0}<div class="empty">nothing scheduled separately</div>{/if}
          </div>
        </section>
        {#each timeBuckets as b (b.id)}
          {@const here = open.filter((k) => k.bucketId === b.id)}
          <section class="mini" class:over={dnd.overDropKey === `bucket:${b.id}` && !dnd.nestIntent}>
            <header>
              <h3 class="display">{b.name}</h3>
              <span class="count">{here.length}</span>
            </header>
            <div class="flow" data-drop="bucket:{b.id}">
              {#each here as k (k.id)}
                <Card card={k} layout="flow" dropKey="bucket:{b.id}" showParent={false} />
              {/each}
            </div>
          </section>
        {/each}
      </div>

      {#if done.length}
        <details class="done">
          <summary>Done ({done.length})</summary>
          {#each done as d (d.id)}
            <div class="done-row">
              <span>✓ {d.title}</span>
              <button class="btn ghost sm" onclick={() => store.reopen(d.id)}>reopen</button>
            </div>
          {/each}
        </details>
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
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .panel {
    width: min(1100px, 100%);
    background: var(--bg);
    padding: 12px 16px 16px;
    animation: pop-in 200ms var(--ease-snap);
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 10px;
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
    display: flex;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .parent-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .parent-wrap :global(.card) {
    width: 280px;
  }
  .add {
    flex: 1;
  }
  .add input {
    width: 100%;
    padding: 8px 10px;
    border: var(--border) solid var(--line);
    border-radius: var(--radius);
    background: #fff;
    color: #2b2418;
    box-shadow: 3px 3px 0 var(--shadow);
    outline: none;
    font-size: 14px;
  }
  .add input:focus {
    box-shadow: 3px 3px 0 var(--accent);
  }
  .stats {
    margin-top: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-faint);
  }
  .trays {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }
  .mini {
    border: 1.5px solid var(--tray-line);
    border-radius: 8px;
    background: var(--tray);
    min-height: 140px;
    transition:
      background 120ms,
      border-color 120ms;
  }
  .mini.over {
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
  h3 {
    margin: 0;
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sub {
    font-size: 11px;
    color: var(--ink-faint);
  }
  .count {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-faint);
  }
  .flow {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px;
    min-height: 100px;
  }
  .empty {
    align-self: center;
    width: 100%;
    text-align: center;
    color: var(--ink-faint);
    font-size: 11px;
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
