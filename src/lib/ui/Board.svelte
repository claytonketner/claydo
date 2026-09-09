<script lang="ts">
  import { store } from '../model/store.svelte';
  import Masonry from './Masonry.svelte';
  import Section from './Section.svelte';

  const packed = $derived(store.buckets.filter((b) => b.kind !== 'done'));
  const doneBucket = $derived(store.buckets.find((b) => b.kind === 'done'));
</script>

<div class="board">
  <Masonry buckets={packed} filter={store.search} />
  {#if doneBucket}
    <Section bucket={doneBucket} filter={store.search} />
  {/if}
</div>

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 16px 40px;
  }
</style>
