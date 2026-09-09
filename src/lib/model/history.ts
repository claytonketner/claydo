/**
 * Snapshot-based undo/redo. The document is small, so we keep whole copies.
 * Call `record(before)` right before a mutation; `undo(current)` returns the
 * state to restore (and stashes `current` for redo).
 */
export class History<T> {
  private past: { label: string; state: T }[] = [];
  private future: { label: string; state: T }[] = [];

  constructor(private limit = 100) {}

  record(before: T, label = 'change'): void {
    this.past.push({ label, state: before });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push({ label: entry.label, state: current });
    return entry.state;
  }

  redo(current: T): T | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push({ label: entry.label, state: current });
    return entry.state;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get undoLabel(): string | null {
    return this.past.at(-1)?.label ?? null;
  }
  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
