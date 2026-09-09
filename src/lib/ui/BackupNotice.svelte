<script lang="ts">
  import { store } from '../model/store.svelte';
  import Icon from './Icon.svelte';

  /**
   * Corner notice until the user has made a backup choice, and again whenever a
   * chosen folder needs its permission renewed.
   */
  let dismissed = $state(false);
  try {
    dismissed = sessionStorage.getItem('claydo-backup-notice') === '1';
  } catch {
    /* storage unavailable */
  }
  function later() {
    dismissed = true;
    try {
      sessionStorage.setItem('claydo-backup-notice', '1');
    } catch {
      /* ignore */
    }
  }
  const needsReconnect = $derived(store.backup.folder?.state === 'needs-permission');
  const show = $derived(store.loaded && (needsReconnect || (store.backupAttention && !dismissed)));
</script>

{#if show}
  <div class="notice px" role="status">
    <div class="head"><Icon name="gear" size={16} /> {needsReconnect ? 'Backup folder needs a click' : 'Set up a backup'}</div>
    {#if needsReconnect}
      <p>The browser wants you to re-allow access to <b>{store.backup.folder?.name}</b> before it can keep writing backups there.</p>
      <div class="actions">
        <button class="btn sm" onclick={() => store.reconnectFolder()}>Reconnect</button>
      </div>
    {:else}
      <p>Your board is stored only in this browser. If its site data is ever cleared, the board is gone. A backup folder fixes that.</p>
      <div class="actions">
        {#if store.backup.supported}
          <button class="btn sm" onclick={() => store.chooseFolder('quick')}>Quick setup</button>
          <button class="btn sm" onclick={() => store.chooseFolder('pick')}>Choose a folder…</button>
        {:else}
          <button class="btn sm" onclick={() => store.acknowledgeBackups('download')}>Download daily</button>
        {/if}
        <button class="btn ghost sm" onclick={later}>Later</button>
      </div>
      {#if store.backup.supported}
        <p class="fine">Quick setup makes a <b>claydo_backups</b> folder in Documents. For extra safety choose a folder that syncs to the cloud instead.</p>
      {:else}
        <p class="fine">This browser can't write to a folder (Chrome and Edge can), so it downloads a backup file once a day instead.</p>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .notice {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 55;
    width: min(340px, calc(100vw - 36px));
    padding: 12px 14px;
    background: var(--paper);
    color: #2b2418;
    animation: pop-in 260ms var(--ease-snap);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 13px;
    margin-bottom: 4px;
  }
  p {
    margin: 0 0 10px;
    font-size: 12.5px;
    color: #4b4232;
  }
  .fine {
    margin: 8px 0 0;
    font-size: 11px;
    color: #6b5f4d;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
</style>
