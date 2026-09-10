<script lang="ts">
  import { store } from '../model/store.svelte';
  import ChildLinks from './ChildLinks.svelte';
  import Masonry from './Masonry.svelte';
  import Section from './Section.svelte';

  const timeBuckets = $derived(store.timeBuckets);
  const sideBuckets = $derived(store.buckets.filter((b) => b.kind === 'people' || b.kind === 'ideas'));
  const doneBucket = $derived(store.buckets.find((b) => b.kind === 'done'));
</script>

<div class="board">
  <Masonry buckets={timeBuckets} filter={store.search} />
  <div class="side-grid">
    {#each sideBuckets as b (b.id)}
      <Section bucket={b} filter={store.search} />
    {/each}
  </div>
  {#if doneBucket}
    <Section bucket={doneBucket} filter={store.search} />
  {/if}
  <ChildLinks />
</div>

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 16px 40px;
  }
  .side-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
    gap: 14px;
    align-items: start;
  }
</style>
