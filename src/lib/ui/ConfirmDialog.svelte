<script lang="ts">
  import { store } from '../model/store.svelte';

  const p = $derived(store.pending);
  const card = $derived(p ? store.card(p.id) : null);
  const verb = $derived(p?.action === 'complete' ? 'finish' : 'delete');
</script>

{#if p && card}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && store.resolvePending('cancel')}>
    <div class="dialog px" role="alertdialog" aria-label="Sub-items">
      <h2 class="display">{p.action === 'complete' ? '✓ Finish' : '✕ Delete'} "{card.title || 'untitled'}"?</h2>
      <p>
        It has <b>{p.count}</b> {p.action === 'complete' ? 'open ' : ''}sub-item{p.count === 1 ? '' : 's'}. {verb === 'finish' ? 'Finish' : 'Delete'} them too, or just this one? If just this one, the sub-items come back onto the board on their own.
      </p>
      <div class="actions">
        <button class="btn" onclick={() => store.resolvePending('all')}>{verb === 'finish' ? 'Finish' : 'Delete'} all {p.count + 1}</button>
        <button class="btn" onclick={() => store.resolvePending('one')}>Just this one</button>
        <button class="btn ghost" onclick={() => store.resolvePending('cancel')}>Cancel <span class="kbd">esc</span></button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(43, 36, 24, 0.35);
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .dialog {
    width: min(460px, 100%);
    background: var(--bg);
    padding: 16px 18px;
    animation: pop-in 200ms var(--ease-snap);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 15px;
  }
  p {
    margin: 0 0 14px;
    font-size: 13.5px;
    color: var(--ink-soft);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
