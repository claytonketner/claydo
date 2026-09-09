<script lang="ts">
  import { store } from '../model/store.svelte';

  let open = $state(false);
  const WEEK = 7 * 86_400_000;
  const thisWeek = $derived(store.doneCards.filter((c) => Date.now() - c.doneAt! < WEEK));
  const recent = $derived(store.doneCards.slice(0, 40));

  function when(ts: number): string {
    const d = Math.floor((Date.now() - ts) / 86_400_000);
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    return `${d}d ago`;
  }
</script>

<section class="done-strip" class:open>
  <header>
    <h2 class="display">Done</h2>
    <span class="stat"><b>{thisWeek.length}</b> this week · {store.doneCards.length} total</span>
    <span class="spacer"></span>
    <button class="btn sm" onclick={() => (open = !open)}>{open ? 'hide' : 'show recent'}</button>
    <button class="btn sm" onclick={() => (store.reflectOpen = true)}>Reflect ✦</button>
  </header>
  {#if open}
    <div class="list">
      {#each recent as c (c.id)}
        {@const person = c.parentId ? store.card(c.parentId) : null}
        <div class="row">
          <span class="t">✓ {c.title}</span>
          {#if person?.kind === 'person'}<span class="who">with {person.title}</span>{/if}
          <span class="when">{when(c.doneAt!)}</span>
          <button class="btn ghost sm" onclick={() => store.reopen(c.id)}>reopen</button>
        </div>
      {/each}
      {#if recent.length === 0}<div class="empty">Nothing finished yet. Press D on a card.</div>{/if}
    </div>
  {/if}
</section>

<style>
  .done-strip {
    border: var(--border) dashed var(--tray-line);
    border-radius: 10px;
    background: rgba(127, 207, 136, 0.08);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat {
    font-size: 12px;
    color: var(--ink-soft);
  }
  .spacer {
    flex: 1;
  }
  .list {
    padding: 0 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    padding: 2px 0;
  }
  .t {
    flex: 1;
    color: var(--ink-soft);
  }
  .who {
    font-size: 11px;
    color: var(--accent-2);
  }
  .when {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-faint);
  }
  .empty {
    color: var(--ink-faint);
    font-size: 12px;
  }
</style>
