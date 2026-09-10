<script lang="ts">
  import { store } from '../model/store.svelte';
  import { emptyDoc, seedDoc } from '../model/seed';
  import { downloadJson, parseDocJson } from '../persist/backup';
  import { listSnapshots, loadSnapshot, type SnapshotMeta } from '../persist/db';
  import Icon from './Icon.svelte';
  import type { BackupFileInfo } from '../persist/folder';

  let snapshots = $state<SnapshotMeta[]>([]);
  let importMode = $state<'merge' | 'replace'>('merge');
  let fileInput = $state<HTMLInputElement | null>(null);
  let newBucket = $state('');
  let confirmClear = $state(false);
  let confirmDemo = $state(false);
  let confirmRestoreKey = $state<string | null>(null);
  let showFiles = $state(false);
  let files = $state<BackupFileInfo[]>([]);

  async function toggleFiles() {
    showFiles = !showFiles;
    if (showFiles) files = await store.backupFiles();
  }

  $effect(() => {
    if (store.settingsOpen) void listSnapshots().then((s) => (snapshots = s));
  });

  const s = $derived(store.doc.settings);

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const doc = parseDocJson(await f.text());
      if (importMode === 'replace') store.replaceDoc(doc);
      else store.mergeDoc(doc);
      store.showToast(`Imported ${doc.cards.length} cards (${importMode})`, () => store.undo());
    } catch (err) {
      store.showToast(`Import failed: ${(err as Error).message}`);
    }
    if (fileInput) fileInput.value = '';
  }
  async function restore(key: string) {
    const doc = await loadSnapshot(key);
    if (!doc) return;
    store.replaceDoc(doc);
    confirmRestoreKey = null;
    store.showToast(`Restored snapshot ${key}`, () => store.undo());
  }
  function close() {
    store.settingsOpen = false;
  }
</script>

{#if store.settingsOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="panel px" role="dialog" aria-label="Settings">
      <header>
        <h2 class="display">Settings</h2>
        <button class="btn sm" onclick={close}>close <span class="kbd">esc</span></button>
      </header>

      <div class="cols">
        <section>
          <h3>Timeframes</h3>
          <p class="help">Budget is in effort points: XS 1 · S 2 · M 4 · L 8 · XL 16. Unsized cards count {s.defaultEffortPoints}. Leave blank for no limit.</p>
          {#each store.timeBuckets as b, i (b.id)}
            <div class="row">
              <input class="name" value={b.name} onchange={(e) => store.updateBucket(b.id, { name: (e.target as HTMLInputElement).value })} />
              <input
                class="budget"
                type="number"
                min="0"
                placeholder="∞"
                value={b.budget ?? ''}
                onchange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  store.updateBucket(b.id, { budget: v === '' ? null : Number(v) });
                }}
              />
              <button class="btn ghost sm" disabled={i === 0} onclick={() => store.moveBucket(b.id, -1)}>↑</button>
              <button class="btn ghost sm" disabled={i === store.timeBuckets.length - 1} onclick={() => store.moveBucket(b.id, 1)}>↓</button>
              <button class="btn ghost sm" disabled={store.timeBuckets.length <= 1} title="Remove (cards move to another timeframe)" onclick={() => store.removeBucket(b.id)}>✕</button>
            </div>
          {/each}
          <div class="row">
            <input
              class="name"
              placeholder="New timeframe…"
              bind:value={newBucket}
              onkeydown={(e) => {
                if (e.key === 'Enter' && newBucket.trim()) {
                  store.addTimeBucket(newBucket.trim());
                  newBucket = '';
                }
                e.stopPropagation();
              }}
            />
          </div>

          <h3>Defaults</h3>
          <label class="row">
            <span>New cards land in</span>
            <select value={s.defaultBucketId} onchange={(e) => store.updateSettings({ defaultBucketId: (e.target as HTMLSelectElement).value, lastDropBucketId: null })}>
              {#each store.timeBuckets as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
            </select>
          </label>
          <label class="row">
            <span>Unsized card counts as</span>
            <input class="budget" type="number" min="0" value={s.defaultEffortPoints} onchange={(e) => store.updateSettings({ defaultEffortPoints: Number((e.target as HTMLInputElement).value) || 0 })} />
            <span>pts</span>
          </label>
          <label class="row">
            <span>Theme</span>
            <select value={s.theme} onchange={(e) => store.updateSettings({ theme: (e.target as HTMLSelectElement).value as 'light' | 'dark' | 'system' })}>
              <option value="system">system</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </label>
          <label class="row">
            <input type="checkbox" checked={s.celebrate} onchange={(e) => store.updateSettings({ celebrate: (e.target as HTMLInputElement).checked })} />
            <span>Celebrate when something gets done</span>
          </label>
          <label class="row">
            <input type="checkbox" checked={s.agingEnabled} onchange={(e) => store.updateSettings({ agingEnabled: (e.target as HTMLInputElement).checked })} />
            <span>Age old todos (yellowing, cracks, cobwebs)</span>
          </label>
        </section>

        <section>
          <h3>Backup</h3>
          <p class="help">Your board is stored in this browser. If the browser's site data gets cleared, it's gone. A backup folder keeps a copy safe.</p>
          {#if store.backup.supported}
            {#if store.backup.folder}
              <div class="row folder" class:warn={store.backup.folder.state === 'needs-permission'}>
                <button class="fname" title="Show the files in this folder" onclick={toggleFiles}><Icon name="folder" size={16} /> {store.backup.folder.name}</button>
                {#if store.backup.folder.state === 'ok'}
                  <span class="help">backs up every hour</span>
                {:else}
                  <button class="btn sm" onclick={() => store.reconnectFolder()}>Reconnect</button>
                  <span class="help">the browser needs you to re-allow access</span>
                {/if}
                <span class="spacer"></span>
                {#if store.backup.folder.state === 'ok'}<button class="btn sm" onclick={() => store.backupNow()}>Backup now</button>{/if}
                <button class="btn ghost sm" onclick={() => store.chooseFolder('pick')}>change</button>
                <button class="btn ghost sm" onclick={() => store.forgetFolder()}>disconnect</button>
              </div>
              {#if showFiles}
                <div class="files">
                  {#if files.length === 0}
                    <span class="help">No backup files yet.</span>
                  {:else}
                    {#each files as f (f.name)}
                      <div class="file"><span class="mono">{f.name}</span><span class="help">{new Date(f.modified).toLocaleString()} · {Math.max(1, Math.round(f.size / 1024))} KB</span></div>
                    {/each}
                  {/if}
                  <p class="help">A web page can't open Finder or Explorer for you; find the folder by name in your file browser.</p>
                </div>
              {/if}
              {#if store.backup.lastError}<p class="help">Last error: {store.backup.lastError}</p>{/if}
            {:else}
              <div class="row">
                <button class="btn" onclick={() => store.chooseFolder('quick')}>Quick setup</button>
                <span class="help">makes a <b>claydo_backups</b> folder in Documents</span>
              </div>
              <div class="row">
                <button class="btn" onclick={() => store.chooseFolder('pick')}>Choose a folder…</button>
                <span class="help">for extra safety, pick one that syncs to the cloud</span>
              </div>
            {/if}
          {:else}
            <p class="help">This browser can't write to a folder (Chrome and Edge can), so a backup file downloads once a day instead.</p>
          {/if}
          {#if !store.backup.folder || store.backup.folder.state !== 'ok'}
            <label class="row">
              <input type="checkbox" checked={s.autoBackup} onchange={(e) => store.acknowledgeBackups((e.target as HTMLInputElement).checked ? 'download' : 'off')} />
              <span>Download a backup file once a day</span>
            </label>
          {/if}
          {#if s.lastBackupAt}<p class="help">Last backup {new Date(s.lastBackupAt).toLocaleString()}.</p>{/if}

          <h3>Share and restore</h3>
          <div class="row">
            <button class="btn" onclick={() => downloadJson(store.doc)}>Export share file</button>
            <span class="help">a copy of the board to send to someone</span>
          </div>
          <div class="row">
            <button class="btn" onclick={() => fileInput?.click()}>Restore from backup…</button>
            <select bind:value={importMode}>
              <option value="merge">add to this board</option>
              <option value="replace">replace this board</option>
            </select>
            <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onFile} />
          </div>

          <h3>Snapshots</h3>
          <p class="help">A copy is kept automatically each day you open the app (last 14).</p>
          {#if snapshots.length === 0}
            <p class="help">None yet.</p>
          {/if}
          {#each snapshots as snap (snap.key)}
            <div class="row">
              <span class="mono">{snap.key}</span>
              <span class="help">{snap.cardCount} cards</span>
              <span class="spacer"></span>
              {#if confirmRestoreKey === snap.key}
                <span class="help">this replaces your current board</span>
                <button class="btn danger sm" onclick={() => restore(snap.key)}>Really restore</button>
                <button class="btn ghost sm" onclick={() => (confirmRestoreKey = null)}>cancel</button>
              {:else}
                <button class="btn ghost sm" onclick={() => (confirmRestoreKey = snap.key)}>restore</button>
              {/if}
            </div>
          {/each}

          <h3>Danger zone</h3>
          <div class="row">
            {#if confirmDemo}
              <span class="help">this replaces your current board</span>
              <button
                class="btn danger"
                onclick={() => {
                  store.replaceDoc(seedDoc());
                  confirmDemo = false;
                  store.showToast('Loaded demo board', () => store.undo());
                }}>Really load demo board</button
              >
              <button class="btn ghost sm" onclick={() => (confirmDemo = false)}>cancel</button>
            {:else}
              <button class="btn" onclick={() => (confirmDemo = true)}>Load demo board…</button>
            {/if}
          </div>
          <div class="row">
            {#if confirmClear}
              <button
                class="btn danger"
                onclick={() => {
                  store.replaceDoc(emptyDoc());
                  confirmClear = false;
                  store.showToast('Board cleared', () => store.undo());
                }}>Really clear everything</button
              >
              <button class="btn ghost sm" onclick={() => (confirmClear = false)}>cancel</button>
            {:else}
              <button class="btn" onclick={() => (confirmClear = true)}>Clear board…</button>
            {/if}
          </div>
        </section>
      </div>

      <hr class="divider" />

      <section class="keys">
        <h3>Keyboard</h3>
        <div class="keygrid">
          <span><span class="kbd">N</span> new todo</span>
          <span><span class="kbd">⏎</span> edit selected</span>
          <span><span class="kbd">D</span> done</span>
          <span><span class="kbd">F</span> focus sub-todos</span>
          <span><span class="kbd">1–5</span> effort</span>
          <span><span class="kbd">⇧1–3</span> value</span>
          <span><span class="kbd">←</span><span class="kbd">→</span> move timeframe</span>
          <span><span class="kbd">⌘D</span> duplicate</span>
          <span><span class="kbd">⌫</span> delete</span>
          <span><span class="kbd">⌘Z</span> undo · <span class="kbd">⇧⌘Z</span> redo</span>
          <span><span class="kbd">/</span> search</span>
          <span><span class="kbd">esc</span> back / deselect</span>
          <span><span class="kbd">⇧</span>+drag near a card to group · hold <span class="kbd">⇧</span> before grabbing a grouped card to move it alone</span>
          <span>type anywhere to start a new todo</span>
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(43, 36, 24, 0.45);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 20px;
    overflow: auto;
  }
  .panel {
    width: min(920px, 100%);
    background: var(--bg);
    padding: 14px 18px 18px;
    animation: pop-in 200ms var(--ease-snap);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
  }
  h3:first-child {
    margin-top: 0;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 24px;
  }
  .help {
    margin: 0;
    font-size: 12px;
    color: var(--ink-faint);
  }
  p.help {
    margin: 0 0 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 13px;
  }
  .spacer {
    flex: 1;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  input:not([type='checkbox']),
  select {
    padding: 4px 6px;
    border: 1.5px solid var(--field-line);
    border-radius: 4px;
    background: var(--field);
    color: var(--field-ink);
    font-size: 13px;
  }
  input:focus,
  select:focus {
    outline: none;
    border-color: var(--accent);
  }
  .name {
    flex: 1;
    min-width: 120px;
  }
  .budget {
    width: 70px;
  }
  .btn.danger {
    background: var(--over);
    color: #fff;
  }
  .fname {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink);
  }
  .fname:hover {
    text-decoration: underline;
  }
  .files {
    margin: 4px 0 8px 8px;
    padding-left: 10px;
    border-left: 2px dashed var(--tray-line);
  }
  .file {
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: 12px;
    padding: 1px 0;
  }
  .folder {
    padding: 6px 8px;
    border: 1.5px dashed var(--tray-line);
    border-radius: 6px;
    flex-wrap: wrap;
    row-gap: 4px;
  }
  .folder .help {
    white-space: nowrap;
  }
  .folder.warn {
    border-color: var(--warn);
    background: rgba(242, 177, 52, 0.12);
  }
  .divider {
    margin: 18px 0 0;
    border: none;
    border-top: 1.5px solid var(--tray-line);
  }
  .keys {
    margin-top: 12px;
  }
  .keygrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px 14px;
    font-size: 12px;
    color: var(--ink-soft);
  }
</style>
