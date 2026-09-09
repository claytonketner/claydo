<script lang="ts">
  import { store } from '../model/store.svelte';
  import type { ViewMode } from '../model/types';

  const views: { id: ViewMode; label: string; hint: string }[] = [
    { id: 'bucket', label: 'Timeframe', hint: 'Drag cards between trays' },
    { id: 'effort', label: 'Effort', hint: 'Group by effort; drag to resize' },
    { id: 'value', label: 'Value', hint: 'Group by value' },
    { id: 'matrix', label: 'Value × Effort', hint: 'Quick wins, big bets, fill-ins, avoid' },
    { id: 'person', label: 'Person', hint: 'Who each card involves' },
    { id: 'tag', label: 'Tag', hint: 'Group by tag' },
    { id: 'age', label: 'Age', hint: 'How long ago it was created' }
  ];
</script>

<div class="views" role="tablist">
  {#each views as v}
    <button class="btn sm" class:active={store.view === v.id} role="tab" aria-selected={store.view === v.id} title={v.hint} onclick={() => (store.view = v.id)}>
      {v.label}
    </button>
  {/each}
</div>

<style>
  .views {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
</style>
