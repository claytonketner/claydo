<script lang="ts">
  import { store } from '../model/store.svelte';
  import { EFFORT_LABELS, type Card } from '../model/types';

  /** Compact attribute chips + (when `editable`) tap-to-set controls. */
  let { card, editable = false }: { card: Card; editable?: boolean } = $props();

  const people = $derived(card.peopleIds.map((id) => store.live(id)).filter((p): p is Card => !!p));
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');
</script>

<div class="chips" class:editable>
  {#if editable || card.effort != null}
    <span class="chip effort" title="Effort (1–5 keys)">
      {#each [1, 2, 3, 4, 5] as const as e}
        <button
          class="pip"
          class:on={card.effort != null && e <= card.effort}
          class:cur={card.effort === e}
          disabled={!editable}
          onclick={(ev) => {
            ev.stopPropagation();
            store.setEffort(card.id, e);
          }}
          aria-label="Effort {EFFORT_LABELS[e]}"
        ></button>
      {/each}
      <span class="lbl">{card.effort ? EFFORT_LABELS[card.effort] : '·'}</span>
    </span>
  {/if}
  {#if editable || card.value != null}
    <span class="chip value" title="Value (⇧1–3)">
      {#each [1, 2, 3] as const as v}
        <button
          class="star"
          class:on={card.value != null && v <= card.value}
          disabled={!editable}
          onclick={(ev) => {
            ev.stopPropagation();
            store.setValue(card.id, v);
          }}
          aria-label="Value {v}">★</button
        >
      {/each}
    </span>
  {/if}
  {#each card.tags as t}
    <span class="chip tag">#{t}</span>
  {/each}
  {#each people as p}
    <span class="chip person" title={p.title}>{initials(p.title)}</span>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    font-size: 10px;
    line-height: 1;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border-radius: 3px;
    background: rgba(43, 36, 24, 0.08);
    color: #4b4232;
    font-weight: 600;
  }
  .chip.tag {
    background: rgba(74, 155, 255, 0.18);
    color: #1f5aa8;
  }
  .chip.person {
    background: #2b2418;
    color: #fff7c9;
    font-family: var(--font-mono);
    letter-spacing: 0.04em;
    padding: 2px 5px;
  }
  .pip,
  .star {
    appearance: none;
    border: 0;
    padding: 0;
    background: none;
    cursor: pointer;
    line-height: 1;
  }
  .pip {
    width: 6px;
    height: 9px;
    border-radius: 1px;
    background: rgba(43, 36, 24, 0.18);
  }
  .pip.on {
    background: #4b4232;
  }
  .pip.cur {
    background: var(--accent);
  }
  .pip:disabled,
  .star:disabled {
    cursor: default;
  }
  .editable .pip:hover,
  .editable .star:hover {
    transform: scale(1.3);
  }
  .lbl {
    margin-left: 2px;
    font-family: var(--font-mono);
    font-size: 9.5px;
  }
  .star {
    font-size: 11px;
    color: rgba(43, 36, 24, 0.25);
  }
  .star.on {
    color: #e0a400;
  }
</style>
