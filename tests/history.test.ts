import { describe, expect, it } from 'vitest';
import { History } from '../src/lib/model/history';

describe('History', () => {
  it('undoes and redoes in order', () => {
    const h = new History<number>();
    h.record(0, 'one');
    h.record(1, 'two');
    expect(h.canUndo).toBe(true);
    expect(h.undoLabel).toBe('two');
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBe(0);
    expect(h.undo(0)).toBeNull();
    expect(h.redo(0)).toBe(1);
    expect(h.redo(1)).toBe(2);
    expect(h.redo(2)).toBeNull();
  });

  it('clears redo on a new record', () => {
    const h = new History<number>();
    h.record(0);
    h.undo(1);
    expect(h.canRedo).toBe(true);
    h.record(5);
    expect(h.canRedo).toBe(false);
  });

  it('respects the limit', () => {
    const h = new History<number>(3);
    for (let i = 0; i < 10; i++) h.record(i);
    expect(h.undo(10)).toBe(9);
    expect(h.undo(9)).toBe(8);
    expect(h.undo(8)).toBe(7);
    expect(h.undo(7)).toBeNull();
  });
});
