/** Tiny registry so distant components can ask inputs to take focus. */
export const ui = $state({
  hoveredId: null as string | null,
  /** Set by FocusOverlay: focus its add-child input on next open. */
  wantFocusAdd: false,
  /** Set by person cards that want their agenda input focused after expanding. */
  wantAgendaFocusId: null as string | null
});

/** Live rendered heights of cards, keyed by id, so free-layout trays can grow to fit. */
export const cardHeights = $state<Record<string, number>>({});

/**
 * Action: report this element's height into `cardHeights`. Pass null to opt
 * out (popup / flow copies of a card must not overwrite or clear the board
 * instance's entry, since trays size themselves from it).
 */
export function measureCard(node: HTMLElement, id: string | null) {
  let cur = id;
  const report = () => {
    if (cur) cardHeights[cur] = node.offsetHeight;
  };
  report();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null;
  ro?.observe(node);
  return {
    update(next: string | null) {
      if (next !== cur) {
        if (cur) delete cardHeights[cur];
        cur = next;
        report();
      }
    },
    destroy() {
      ro?.disconnect();
      if (cur) delete cardHeights[cur];
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
