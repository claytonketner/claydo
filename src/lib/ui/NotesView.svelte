<script lang="ts">
  import { asHref } from '../model/parse';

  let { text, clamp = 0 }: { text: string; clamp?: number } = $props();

  interface Line {
    bullet: boolean;
    parts: { text: string; href: string | null }[];
  }
  /** Show only the host for links, so long URLs don't swamp a card. */
  function label(href: string): string {
    try {
      return new URL(href).hostname.replace(/^www\./, '');
    } catch {
      return href;
    }
  }

  const lines = $derived.by((): Line[] => {
    const raw = text.split('\n').filter((l, i, arr) => l.trim() !== '' || (i > 0 && i < arr.length - 1));
    return raw.map((l) => {
      const bullet = /^\s*[-*]\s+/.test(l);
      const body = bullet ? l.replace(/^\s*[-*]\s+/, '') : l;
      const parts = body.split(/(\s+)/).map((w) => ({ text: w, href: /\s/.test(w) ? null : asHref(w) }));
      return { bullet, parts };
    });
  });
  const shown = $derived(clamp > 0 ? lines.slice(0, clamp) : lines);
  const more = $derived(clamp > 0 ? Math.max(0, lines.length - clamp) : 0);
</script>

<div class="notes">
  {#each shown as line}
    <div class="line" class:bullet={line.bullet}>
      {#if line.bullet}<span class="dot">▪</span>{/if}
      <span class="body">
        {#each line.parts as p}
          {#if p.href}<a href={p.href} target="_blank" rel="noopener" title={p.href} onpointerdown={(e) => e.stopPropagation()}>{label(p.href)}</a>{:else}{p.text}{/if}
        {/each}
      </span>
    </div>
  {/each}
  {#if more > 0}
    <div class="more">+{more} more</div>
  {/if}
</div>

<style>
  /* Cards are always light paper, so these stay fixed rather than following the theme. */
  .notes {
    font-size: 11.5px;
    line-height: 1.35;
    color: #6b5f4d;
    white-space: pre-wrap;
    word-break: break-word;
  }
  :global(.card.selected) .notes,
  :global(.card:hover) .notes {
    color: #4b4232;
  }
  .line {
    display: flex;
    gap: 4px;
  }
  .line.bullet .dot {
    flex: 0 0 auto;
    color: var(--accent);
    font-size: 9px;
    line-height: 1.7;
  }
  .more {
    font-size: 10px;
    color: #a2957f;
    margin-top: 2px;
  }
  a {
    color: var(--accent-2);
    text-decoration: underline;
  }
</style>
