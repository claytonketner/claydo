<script lang="ts">
  import { store } from '../model/store.svelte';
  import { emptyDoc, seedDoc } from '../model/seed';
  import { downloadJson, parseDocJson } from '../persist/backup';
  import { listSnapshots, loadSnapshot, type SnapshotMeta } from '../persist/db';

  let snapshots = $state<SnapshotMeta[]>([]);
  let importMode = $state<'merge' | 'replace'>('merge');
  let fileInput = $state<HTMLInputElement | null>(null);
  let newBucket = $state('');
  let confirmClear = $state(false);

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
        </section>

        <section>
          <h3>Backup</h3>
          <p class="help">Your board lives in this browser. Export a JSON file now and then, or turn on the daily backup.</p>
          <div class="row">
            <button class="btn" onclick={() => downloadJson(store.doc)}>Export JSON</button>
            <button class="btn" onclick={() => fileInput?.click()}>Import JSON…</button>
            <select bind:value={importMode}>
              <option value="merge">merge into board</option>
              <option value="replace">replace board</option>
            </select>
            <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onFile} />
          </div>
          <label class="row">
            <input type="checkbox" checked={s.autoBackup} onchange={(e) => store.updateSettings({ autoBackup: (e.target as HTMLInputElement).checked })} />
            <span>Download a backup every hour while the app is open</span>
          </label>
          <p class="help">
            Only when something changed. Files land in your browser's Downloads folder as <code>claydo-YYYYMMDD-HHMM.json</code>{#if s.lastBackupAt}; last one {new Date(s.lastBackupAt).toLocaleString()}{/if}.
          </p>

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
              <button class="btn ghost sm" onclick={() => restore(snap.key)}>restore</button>
            </div>
          {/each}

          <h3>Danger zone</h3>
          <div class="row">
            <button class="btn" onclick={() => store.replaceDoc(seedDoc())}>Load demo board</button>
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
          <span><span class="kbd">⇧</span>+drag near a card to group · <span class="kbd">⌥</span>+drag a grouped card alone</span>
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
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--ink-faint);
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
