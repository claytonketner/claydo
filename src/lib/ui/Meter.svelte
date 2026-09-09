<script lang="ts">
  import type { BucketLoad } from '../model/capacity';
  import { loadLevel } from '../model/capacity';
  import { store } from '../model/store.svelte';
  import type { Bucket } from '../model/types';

  let { bucket, load }: { bucket: Bucket; load: BucketLoad } = $props();

  const SEGMENTS = 10;
  let editing = $state(false);
  let draft = $state('');

  const level = $derived(loadLevel(load.ratio));
  const filled = $derived(load.ratio == null ? 0 : Math.min(SEGMENTS, Math.round(load.ratio * SEGMENTS)));
  const overflow = $derived(load.ratio == null ? 0 : Math.min(6, Math.max(0, Math.round((load.ratio - 1) * SEGMENTS))));
  const overBy = $derived(load.budget == null ? 0 : Math.max(0, load.points - load.budget));
  const tip = $derived.by(() => {
    const head = load.budget == null ? `${load.points} pts (no budget)` : `${load.points} / ${load.budget} pts`;
    const rows = load.contributors.slice(0, 12).map((c) => `${c.points}  ${c.card.title || '(untitled)'}`);
    return [head, ...rows].join('\n');
  });

  function startEdit() {
    draft = load.budget == null ? '' : String(load.budget);
    editing = true;
  }
  function commitEdit() {
    const n = draft.trim() === '' ? null : Math.max(0, Math.round(Number(draft)));
    store.updateBucket(bucket.id, { budget: n == null || Number.isNaN(n) ? null : n });
    editing = false;
  }
</script>

<div class="meter {level}" title={tip}>
  {#if editing}
    <input
      class="budget-input"
      type="number"
      min="0"
      bind:value={draft}
      onblur={commitEdit}
      onkeydown={(e) => {
        if (e.key === 'Enter') commitEdit();
        if (e.key === 'Escape') editing = false;
      }}
      placeholder="∞"
      aria-label="Budget in points"
    />
  {:else}
    <button class="bar" onclick={startEdit} aria-label="Edit budget">
      {#each Array(SEGMENTS) as _, i}
        <span class="seg" class:on={i < filled}></span>
      {/each}
      {#each Array(overflow) as _}
        <span class="seg over on"></span>
      {/each}
    </button>
    <span class="label">
      {#if load.budget == null}
        <span class="pts">{load.points}</span><span class="inf">∞</span>
      {:else if level === 'over'}
        <span class="pts">over by ~{overBy}</span>
      {:else}
        <span class="pts">{load.points}</span>/{load.budget}
      {/if}
    </span>
  {/if}
</div>

<style>
  .meter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .bar {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border: 1.5px solid var(--tray-line);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.35);
    cursor: pointer;
  }
  .bar:hover {
    border-color: var(--ink);
  }
  .seg {
    width: 7px;
    height: 9px;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 1px;
    transition: background 200ms var(--ease-out);
  }
  .ok .seg.on {
    background: var(--ok);
  }
  .warn .seg.on {
    background: var(--warn);
  }
  .over .seg.on {
    background: var(--over);
  }
  .seg.over {
    width: 5px;
    height: 12px;
    margin-top: -1.5px;
  }
  .over .bar {
    rotate: -3deg;
    border-color: var(--over);
  }
  .over .label {
    color: var(--over);
    font-weight: 700;
  }
  .pts {
    font-weight: 700;
    color: var(--ink);
  }
  .over .pts {
    color: var(--over);
  }
  .inf {
    margin-left: 3px;
    opacity: 0.6;
  }
  .budget-input {
    width: 56px;
    padding: 2px 4px;
    border: 1.5px solid var(--ink);
    border-radius: 4px;
    background: #fff;
    color: #2b2418;
  }
</style>
