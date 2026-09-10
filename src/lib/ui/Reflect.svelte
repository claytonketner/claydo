<script lang="ts">
  import { EFFORT_POINTS } from '../model/types';
  import { store } from '../model/store.svelte';
  import Icon from './Icon.svelte';

  const DAY = 86_400_000;
  type Range = 'week' | 'month' | 'quarter' | 'year';
  let range = $state<Range>('week');
  const days: Record<Range, number> = { week: 7, month: 30, quarter: 91, year: 365 };

  const since = $derived(Date.now() - days[range] * DAY);
  const done = $derived(store.doneCards.filter((c) => c.doneAt! >= since && c.kind !== 'person').sort((a, b) => a.doneAt! - b.doneAt!));
  const points = $derived(done.reduce((s, c) => s + (c.effort ? EFFORT_POINTS[c.effort] : store.doc.settings.defaultEffortPoints), 0));
  const byPerson = $derived.by(() => {
    const m = new Map<string, number>();
    for (const c of done) {
      const p = c.parentId ? store.card(c.parentId) : null;
      const names = [...(p?.kind === 'person' ? [p.title] : []), ...c.peopleIds.map((id) => store.card(id)?.title).filter((n): n is string => !!n)];
      for (const n of new Set(names)) m.set(n, (m.get(n) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });
  /** Heatmap: one cell per day in range, oldest first. */
  const heat = $derived.by(() => {
    const n = days[range];
    const counts = new Array<number>(n).fill(0);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startTs = start.getTime() - (n - 1) * DAY;
    for (const c of done) {
      const i = Math.floor((c.doneAt! - startTs) / DAY);
      if (i >= 0 && i < n) counts[i]++;
    }
    const max = Math.max(1, ...counts);
    return counts.map((v, i) => ({ v, level: v === 0 ? 0 : Math.ceil((v / max) * 4), date: new Date(startTs + i * DAY) }));
  });

  const markdown = $derived.by(() => {
    const lines = [`# Done in the last ${range}`, ''];
    for (const c of done) {
      const p = c.parentId ? store.card(c.parentId) : null;
      const who = p?.kind === 'person' ? ` (with ${p.title})` : '';
      lines.push(`- ${c.title}${who}`);
    }
    return lines.join('\n');
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      store.showToast('Copied as Markdown');
    } catch {
      store.showToast('Could not copy');
    }
  }

  function brickWidth(c: (typeof done)[number]): number {
    const p = c.effort ? EFFORT_POINTS[c.effort] : store.doc.settings.defaultEffortPoints;
    return 60 + Math.min(4, Math.log2(Math.max(1, p))) * 36;
  }
  function fmt(d: Date): string {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
</script>

{#if store.reflectOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && (store.reflectOpen = false)}>
    <div class="panel px" role="dialog" aria-label="Reflect">
      <header>
        <h2 class="display"><Icon name="eye" size={22} />Look back</h2>
        <div class="ranges">
          {#each ['week', 'month', 'quarter', 'year'] as const as r}
            <button class="btn sm" class:active={range === r} onclick={() => (range = r)}>{r}</button>
          {/each}
        </div>
        <span class="spacer"></span>
        <button class="btn sm" onclick={copy}>copy as Markdown</button>
        <button class="btn sm" onclick={() => (store.reflectOpen = false)}>close</button>
      </header>

      <div class="stats">
        <div class="stat"><b>{done.length}</b><span>finished</span></div>
        <div class="stat"><b>{points}</b><span>effort pts</span></div>
        <div class="stat"><b>{byPerson.length}</b><span>people</span></div>
        <div class="stat"><b>{heat.filter((h) => h.v > 0).length}</b><span>active days</span></div>
      </div>

      <h3>Heatmap</h3>
      <div class="heat" style:--cols={Math.min(heat.length, 53)}>
        {#each heat as h}
          <span class="cell l{h.level}" title="{fmt(h.date)}: {h.v}"></span>
        {/each}
      </div>

      <h3>The wall</h3>
      <p class="help">One brick per finished thing, wider for bigger efforts. Laid in the order you finished them.</p>
      <div class="wall">
        {#each done as c, i (c.id)}
          {@const p = c.parentId ? store.card(c.parentId) : null}
          <div class="brick" style:width="{brickWidth(c)}px" style:animation-delay="{Math.min(i, 40) * 18}ms" title="{c.title}\n{fmt(new Date(c.doneAt!))}{p?.kind === 'person' ? `\nwith ${p.title}` : ''}">
            <span class="bt">{c.title}</span>
          </div>
        {/each}
        {#if done.length === 0}
          <div class="help">Nothing finished in this range yet. The wall is waiting.</div>
        {/if}
      </div>

      {#if byPerson.length}
        <div class="cols">
          <section>
            <h3>With people</h3>
            {#each byPerson as [name, n]}
              <div class="bar-row"><span class="lbl">{name}</span><span class="bar" style:width="{(n / byPerson[0][1]) * 100}%"></span><span class="n">{n}</span></div>
            {/each}
          </section>
        </div>
      {/if}

      <details class="list">
        <summary>As a list ({done.length})</summary>
        <pre>{markdown}</pre>
      </details>
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
    width: min(960px, 100%);
    background: var(--bg);
    padding: 14px 18px 18px;
    animation: pop-in 200ms var(--ease-snap);
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
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
  .ranges {
    display: flex;
    gap: 4px;
  }
  .spacer {
    flex: 1;
  }
  .help {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--ink-faint);
  }
  .stats {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 96px;
    padding: 8px 12px;
    border: var(--border) solid var(--line);
    border-radius: var(--radius);
    background: var(--paper);
    color: #2b2418;
    box-shadow: 3px 3px 0 var(--shadow);
  }
  .stat b {
    font-size: 22px;
    font-family: var(--font-display);
  }
  .stat span {
    font-size: 11px;
    color: #6b5f4d;
  }
  .heat {
    display: grid;
    grid-template-columns: repeat(var(--cols), 12px);
    gap: 3px;
  }
  .cell {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: rgba(43, 36, 24, 0.1);
  }
  .cell.l1 {
    background: #b7e2b9;
  }
  .cell.l2 {
    background: #8fd393;
  }
  .cell.l3 {
    background: #5fbf67;
  }
  .cell.l4 {
    background: #2f9a3a;
  }
  .wall {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    border: 1.5px dashed var(--tray-line);
    border-radius: 8px;
    min-height: 60px;
  }
  .brick {
    height: 30px;
    padding: 0 8px;
    border: 2px solid var(--line);
    border-radius: 3px;
    background: linear-gradient(180deg, #ffb08a, #ff8a5c);
    color: #2b2418;
    font-size: 11px;
    font-weight: 600;
    line-height: 26px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    box-shadow: 2px 2px 0 var(--shadow);
    animation: pop-in 260ms var(--ease-snap) both;
  }
  .brick:nth-child(3n) {
    background: linear-gradient(180deg, #ffd47a, #f2b134);
  }
  .brick:nth-child(3n + 1) {
    background: linear-gradient(180deg, #9fd8ff, #4a9bff);
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 20px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 120px 1fr 30px;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    margin-bottom: 4px;
  }
  .lbl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    display: block;
    height: 12px;
    background: var(--accent-2);
    border: 1.5px solid var(--line);
    border-radius: 3px;
    min-width: 6px;
  }
  .bar.alt {
    background: var(--accent);
  }
  .n {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-faint);
  }
  .list {
    margin-top: 14px;
    font-size: 12.5px;
  }
  .list summary {
    cursor: pointer;
    color: var(--ink-soft);
  }
  pre {
    font-family: var(--font-mono);
    font-size: 12px;
    white-space: pre-wrap;
    background: rgba(255, 255, 255, 0.5);
    padding: 10px;
    border-radius: 6px;
    border: 1.5px solid var(--tray-line);
  }
</style>
