<script lang="ts">
  import { store, Store } from '../model/store.svelte';
  import Icon from './Icon.svelte';

  let confirmEmpty = $state(false);
  const items = $derived(store.trash);

  function ago(ts: number): string {
    const d = Math.floor((Date.now() - ts) / 86_400_000);
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    return `${d}d ago`;
  }
  function daysLeft(ts: number): number {
    return Math.max(0, Store.TRASH_DAYS - Math.floor((Date.now() - ts) / 86_400_000));
  }
  function close() {
    store.trashOpen = false;
    confirmEmpty = false;
  }
</script>

{#if store.trashOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="panel px" role="dialog" aria-label="Trash">
      <header>
        <h2 class="display"><Icon name="trash" size={18} /> Trash <span class="count">{items.length}</span></h2>
        <span class="spacer"></span>
        {#if items.length}
          {#if confirmEmpty}
            <button
              class="btn sm danger"
              onclick={() => {
                store.purgeTrash(true);
                confirmEmpty = false;
                store.showToast('Trash emptied', () => store.undo());
              }}>Really empty</button
            >
            <button class="btn ghost sm" onclick={() => (confirmEmpty = false)}>cancel</button>
          {:else}
            <button class="btn sm" onclick={() => (confirmEmpty = true)}>Empty trash…</button>
          {/if}
        {/if}
        <button class="btn sm" onclick={close}>close <span class="kbd">esc</span></button>
      </header>
      <p class="help">Deleted cards wait here for {Store.TRASH_DAYS} days, then go for good.</p>
      {#if items.length === 0}
        <div class="empty">Nothing in the trash.</div>
      {/if}
      <div class="list">
        {#each items as c (c.id)}
          {@const parent = c.parentId ? store.card(c.parentId) : null}
          <div class="row kind-{c.kind}" class:done={c.doneAt != null}>
            <span class="kind">{c.kind}</span>
            <span class="title">{c.doneAt != null ? '✓ ' : ''}{c.title || '(untitled)'}{#if parent}<span class="parent"> ↰ {parent.title}</span>{/if}</span>
            <span class="when" title="{daysLeft(c.deletedAt!)} days left">deleted {ago(c.deletedAt!)}</span>
            <button class="btn sm" onclick={() => store.restore(c.id)}>↺ Restore</button>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(43, 36, 24, 0.45);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 20px;
    overflow: auto;
  }
  .panel {
    width: min(720px, 100%);
    background: var(--bg);
    padding: 14px 18px 18px;
    animation: pop-in 200ms var(--ease-snap);
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-faint);
    margin-left: 6px;
  }
  .spacer {
    flex: 1;
  }
  .help {
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--ink-faint);
  }
  .empty {
    padding: 24px;
    text-align: center;
    color: var(--ink-faint);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border: 1.5px dashed var(--tray-line);
    border-radius: 6px;
    font-size: 13px;
  }
  .row.kind-person {
    border-color: rgba(74, 155, 255, 0.5);
  }
  .kind {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    color: var(--ink-faint);
    width: 48px;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row.done .title {
    color: var(--ink-soft);
  }
  .parent {
    color: var(--ink-faint);
    font-size: 11.5px;
  }
  .when {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-faint);
    white-space: nowrap;
  }
  .btn.danger {
    background: var(--over);
    color: #fff;
  }
</style>
