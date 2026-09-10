<script lang="ts">
  /** Chunky line icons that match the card outlines. */
  let { name, size = 20 }: { name: 'undo' | 'redo' | 'trash' | 'gear' | 'eye' | 'folder'; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'undo'}
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H10" />
  {:else if name === 'redo'}
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9h-9.5a5.5 5.5 0 0 0 0 11H14" />
  {:else if name === 'trash'}
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  {:else if name === 'gear'}
    <path
      d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
    />
    <circle cx="12" cy="12" r="3" />
  {:else if name === 'folder'}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  {:else if name === 'eye'}
    <path d="M18.5 12.714C18.5 15.081 15.366 17 11.5 17C7.634 17 4.5 15.081 4.5 12.714C4.5 10.347 7.634 8.429 11.5 8.429C15.366 8.429 18.5 10.347 18.5 12.714Z" />
    <circle cx="11.5" cy="12.714" r="1.9" />
    <path d="M11.5 8.5V5" />
    <path d="M17.6 6.7 16.2 9.5" />
    <path d="M5.4 6.7 6.8 9.5" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    flex: 0 0 auto;
  }
</style>
