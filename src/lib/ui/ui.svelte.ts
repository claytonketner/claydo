import { store } from '../model/store.svelte';

/** Tiny registry so distant components can ask inputs to take focus. */
export const ui = $state({
  hoveredId: null as string | null,
  /** Set by FocusOverlay: focus its add-child input on next open. */
  wantFocusAdd: false,
  /** Set by person cards that want their agenda input focused after expanding. */
  wantAgendaFocusId: null as string | null
});

/**
 * Action: report this element's height into `store.cardHeights`, which trays size
 * themselves from and placement reads. Pass null to opt out (popup / flow copies of
 * a card must not overwrite or clear the board instance's entry).
 */
export function measureCard(node: HTMLElement, id: string | null) {
  let cur = id;
  const report = () => {
    if (cur) store.cardHeights[cur] = node.offsetHeight;
  };
  report();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null;
  ro?.observe(node);
  return {
    update(next: string | null) {
      if (next !== cur) {
        if (cur) delete store.cardHeights[cur];
        cur = next;
        report();
      }
    },
    destroy() {
      ro?.disconnect();
      if (cur) delete store.cardHeights[cur];
    }
  };
}

let quickAddFocus: ((prefill?: string) => void) | null = null;
let searchFocus: (() => void) | null = null;

export function registerQuickAdd(fn: typeof quickAddFocus) {
  quickAddFocus = fn;
}
export function focusQuickAdd(prefill?: string) {
  quickAddFocus?.(prefill);
}
export function registerSearch(fn: typeof searchFocus) {
  searchFocus = fn;
}
export function focusSearch() {
  searchFocus?.();
}

export function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/** Auto-grow a textarea to fit its content. */
export function autosize(node: HTMLTextAreaElement) {
  const fit = () => {
    node.style.height = '0px';
    node.style.height = `${node.scrollHeight}px`;
  };
  fit();
  node.addEventListener('input', fit);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(node);
  return {
    update: fit,
    destroy() {
      node.removeEventListener('input', fit);
      ro?.disconnect();
    }
  };
}

/** Select all text on mount. */
export function selectAllOnMount(node: HTMLInputElement | HTMLTextAreaElement) {
  requestAnimationFrame(() => {
    node.focus();
    node.select();
  });
}
