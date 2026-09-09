<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from './lib/model/store.svelte';
  import Board from './lib/ui/Board.svelte';
  import GroupView from './lib/ui/GroupView.svelte';
  import FocusOverlay from './lib/ui/FocusOverlay.svelte';
  import QuickAdd from './lib/ui/QuickAdd.svelte';
  import Settings from './lib/ui/Settings.svelte';
  import Toast from './lib/ui/Toast.svelte';
  import ViewSwitcher from './lib/ui/ViewSwitcher.svelte';
  import Reflect from './lib/ui/Reflect.svelte';
  import Confetti from './lib/ui/Confetti.svelte';
  import { focusQuickAdd, focusSearch, isTypingTarget, registerSearch } from './lib/ui/ui.svelte';

  let searchEl = $state<HTMLInputElement | null>(null);

  onMount(() => {
    void store.init();
    registerSearch(() => searchEl?.focus());
    const flush = () => void store.flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
    return () => window.removeEventListener('pagehide', flush);
  });

  $effect(() => {
    const t = store.doc.settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  });

  function onKey(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    const typing = isTypingTarget(e.target);

    // Global, even while typing
    if (meta && e.key.toLowerCase() === 'z') {
      if (typing) return;
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (meta && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      focusQuickAdd();
      return;
    }
    if (meta && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      focusSearch();
      return;
    }
    if (e.key === 'Escape') {
      if (typing) {
        (e.target as HTMLElement).blur();
        return;
      }
      if (store.settingsOpen) store.settingsOpen = false;
      else if (store.reflectOpen) store.reflectOpen = false;
      else if (store.editingId) store.editingId = null;
      else if (store.focusedId) store.popFocus();
      else if (store.selectedId) store.selectedId = null;
      else if (store.search) store.search = '';
      return;
    }
    if (typing) return;

    if (e.key === '/' && !meta) {
      e.preventDefault();
      focusSearch();
      return;
    }
    if (meta && e.key.toLowerCase() === 'd' && store.selectedId) {
      e.preventDefault();
      store.duplicate(store.selectedId);
      return;
    }
    if (meta || e.altKey) return;

    const sel = store.selected;
    if (sel) {
      const k = e.key;
      if (k === 'Enter') {
        e.preventDefault();
        store.editingId = sel.id;
        return;
      }
      if (k === 'Backspace' || k === 'Delete') {
        e.preventDefault();
        store.deleteCard(sel.id);
        return;
      }
      if (e.shiftKey && /^Digit[123]$/.test(e.code)) {
        e.preventDefault();
        store.setValue(sel.id, Number(e.code.slice(5)) as 1 | 2 | 3);
        return;
      }
      if (!e.shiftKey && /^[1-5]$/.test(k)) {
        e.preventDefault();
        store.setEffort(sel.id, Number(k) as 1 | 2 | 3 | 4 | 5);
        return;
      }
      if (k === 'd' || k === 'D') {
        e.preventDefault();
        store.complete(sel.id);
        return;
      }
      if (k === 'f' || k === 'F') {
        e.preventDefault();
        store.focus(sel.id);
        return;
      }
      if (k === 'n' || k === 'N') {
        e.preventDefault();
        focusQuickAdd();
        return;
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const tb = store.timeBuckets;
        const bid = sel.bucketId;
        const i = tb.findIndex((b) => b.id === bid);
        if (i < 0) return;
        const j = i + (k === 'ArrowLeft' ? -1 : 1);
        if (j < 0 || j >= tb.length) return;
        e.preventDefault();
        if (sel.parentId) store.updateCard(sel.id, { bucketId: tb[j].id, pos: store.freeSpot(tb[j].id, sel.id) }, { label: 'move' });
        else store.moveToBucket(sel.id, tb[j].id);
        return;
      }
      if (k === 'ArrowUp' && sel.parentId && !store.focusedId) {
        e.preventDefault();
        store.focus(sel.parentId);
        return;
      }
    }

    // Nothing selected: N opens a fresh quick-add; any other printable key starts typing one
    if (sel || e.key.length !== 1) return;
    e.preventDefault();
    if (e.key === 'n' || e.key === 'N') focusQuickAdd();
    else focusQuickAdd(e.key);
  }
</script>

<svelte:window onkeydown={onKey} />

{#if !store.loaded}
  <div class="loading display">loading…</div>
{:else}
  <div class="app">
    <header class="topbar">
      <div class="brand display" title="Claydo">
        <span class="logo">▣</span> claydo
      </div>
      <QuickAdd />
      <div class="search px" class:has={!!store.search}>
        <span class="mag">⌕</span>
        <input
          bind:this={searchEl}
          bind:value={store.search}
          placeholder="filter"
          onkeydown={(e) => {
            if (e.key === 'Escape') {
              store.search = '';
              (e.target as HTMLInputElement).blur();
            }
            e.stopPropagation();
          }}
          aria-label="Filter cards"
        />
        {#if store.search}<button class="clear" onclick={() => (store.search = '')}>✕</button>{:else}<span class="kbd">/</span>{/if}
      </div>
      <div class="history">
        <button class="btn sm ghost" disabled={!store.canUndo} title="Undo (⌘Z)" onclick={() => store.undo()}>↶</button>
        <button class="btn sm ghost" disabled={!store.canRedo} title="Redo (⇧⌘Z)" onclick={() => store.redo()}>↷</button>
      </div>
      <button class="btn sm" title="Settings" onclick={() => (store.settingsOpen = true)}>⚙</button>
    </header>
    <div class="viewbar">
      <ViewSwitcher />
      {#if store.dirty}<span class="saving">saving…</span>{/if}
    </div>

    {#if store.view === 'bucket'}
      <Board />
    {:else}
      <GroupView view={store.view} />
    {/if}
  </div>

  <FocusOverlay />
  <Settings />
  <Reflect />
  <Confetti />
  <Toast />
{/if}

<style>
  .loading {
    display: grid;
    place-items: center;
    height: 100vh;
    color: var(--ink-faint);
  }
  .app {
    min-height: 100vh;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: var(--bg);
    border-bottom: var(--border) solid var(--tray-line);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.06em;
    user-select: none;
  }
  .logo {
    color: var(--accent);
    font-size: 18px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    background: #fff;
    color: #2b2418;
    width: 190px;
  }
  .search.has {
    border-color: var(--accent-2);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 13px;
  }
  .mag {
    color: var(--ink-faint);
  }
  .clear {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--ink-soft);
  }
  .history {
    display: flex;
    gap: 2px;
  }
  .viewbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px 0;
  }
  .saving {
    font-size: 11px;
    color: var(--ink-faint);
    font-family: var(--font-mono);
  }
</style>
