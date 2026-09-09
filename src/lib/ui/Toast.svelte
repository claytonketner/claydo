<script lang="ts">
  import { store } from '../model/store.svelte';
</script>

{#if store.toast}
  {#key store.toast.id}
    <div class="toast px" role="status">
      <span>{store.toast.text}</span>
      {#if store.toast.undo}
        <button
          class="btn sm"
          onclick={() => {
            store.toast?.undo?.();
            store.toast = null;
          }}>Undo <span class="kbd">⌘Z</span></button
        >
      {/if}
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--paper);
    color: #2b2418;
    font-weight: 600;
    font-size: 13px;
    z-index: 60;
    animation: pop-in 260ms var(--ease-snap);
  }
</style>
