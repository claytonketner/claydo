<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../model/store.svelte';
  import { registerQuickAdd } from './ui.svelte';

  let input = $state<HTMLInputElement | null>(null);
  let text = $state('');
  let focused = $state(false);

  onMount(() => {
    registerQuickAdd((prefill) => {
      if (prefill != null) text = prefill;
      input?.focus();
      if (prefill == null) input?.select();
    });
  });

  const target = $derived.by(() => {
    if (store.focused) return `→ under "${store.focused.title || 'untitled'}"`;
    const b = store.doc.buckets.find((x) => x.id === store.defaultBucketId);
    return b ? `→ ${b.name}` : '';
  });

  function submit() {
    const t = text.trim();
    if (!t) return;
    const card = store.quickAdd(t, { parentId: store.focusedId });
    if (card) text = '';
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      text = '';
      input?.blur();
    }
    e.stopPropagation();
  }
</script>

<div class="quick px" class:focused>
  <span class="plus">+</span>
  <input
    bind:this={input}
    bind:value={text}
    placeholder="Add a todo… try: Call vendor @helen #purchasing !s *3 >today"
    onkeydown={onKey}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    aria-label="Quick add"
  />
  <span class="target">{target}</span>
  {#if !focused}<span class="kbd">N</span>{/if}
  {#if focused}
    <div class="hint">
      <span><b>@</b>person</span><span><b>#</b>tag</span><span><b>!</b>xs·s·m·l·xl</span><span><b>*</b>1–3 value</span><span><b>&gt;</b>today·week·soon·later</span
      ><span><b>+</b> child of selected</span><span><b>~</b> idea</span><span><b>//</b> notes</span>
    </div>
  {/if}
</div>

<style>
  .quick {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 320px;
    min-width: 220px;
    max-width: 720px;
    padding: 6px 10px;
    background: #fff;
    color: #2b2418;
    transition: box-shadow 120ms var(--ease-out);
  }
  .quick.focused {
    box-shadow: 4px 4px 0 var(--accent);
    border-color: var(--accent);
  }
  .plus {
    font-weight: 900;
    font-size: 16px;
    color: var(--accent);
  }
  input {
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 14px;
    min-width: 0;
  }
  .target {
    font-size: 11px;
    color: var(--ink-faint);
    white-space: nowrap;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    position: absolute;
    left: -2px;
    right: -2px;
    top: calc(100% + 6px);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 6px 10px;
    border: var(--border) solid var(--line);
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: 3px 3px 0 var(--shadow);
    font-size: 11px;
    color: #4b4232;
    z-index: 30;
    animation: pop-in 140ms var(--ease-out);
  }
  .hint b {
    color: var(--accent);
    font-family: var(--font-mono);
  }
</style>
