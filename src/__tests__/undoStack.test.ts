import { describe, it, expect } from 'vitest';
import { UndoStack } from '../utils/undoStack';

describe('UndoStack', () => {
  it('starts empty', () => {
    const stack = new UndoStack();
    expect(stack.length).toBe(0);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
    expect(stack.current()).toBeNull();
  });

  it('push adds an entry', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    expect(stack.length).toBe(1);
    expect(stack.current()).toEqual({ value: 'a', cursorPos: 1 });
  });

  it('undo returns previous entry', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'ab', cursorPos: 2 });
    expect(stack.canUndo()).toBe(true);
    const entry = stack.undo();
    expect(entry).toEqual({ value: 'a', cursorPos: 1 });
  });

  it('redo returns next entry after undo', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'ab', cursorPos: 2 });
    stack.undo();
    expect(stack.canRedo()).toBe(true);
    const entry = stack.redo();
    expect(entry).toEqual({ value: 'ab', cursorPos: 2 });
  });

  it('undo returns null when at beginning', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    expect(stack.undo()).toBeNull();
  });

  it('redo returns null when at end', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    expect(stack.redo()).toBeNull();
  });

  it('push after undo discards redo entries', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'ab', cursorPos: 2 });
    stack.push({ value: 'abc', cursorPos: 3 });
    stack.undo(); // back to 'ab'
    stack.push({ value: 'ax', cursorPos: 2 });
    expect(stack.canRedo()).toBe(false);
    expect(stack.current()).toEqual({ value: 'ax', cursorPos: 2 });
    expect(stack.length).toBe(3); // 'a', 'ab', 'ax'
  });

  it('deduplicates identical values (updates cursor only)', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'a', cursorPos: 0 });
    expect(stack.length).toBe(1);
    expect(stack.current()!.cursorPos).toBe(0);
  });

  it('replaceCurrent updates the current entry', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'ab', cursorPos: 2 });
    stack.replaceCurrent({ value: 'abc', cursorPos: 3 });
    expect(stack.length).toBe(2);
    expect(stack.current()).toEqual({ value: 'abc', cursorPos: 3 });
  });

  it('replaceCurrent on empty stack pushes', () => {
    const stack = new UndoStack();
    stack.replaceCurrent({ value: 'x', cursorPos: 1 });
    expect(stack.length).toBe(1);
    expect(stack.current()).toEqual({ value: 'x', cursorPos: 1 });
  });

  it('respects maxSize', () => {
    const stack = new UndoStack(3);
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'b', cursorPos: 1 });
    stack.push({ value: 'c', cursorPos: 1 });
    stack.push({ value: 'd', cursorPos: 1 });
    expect(stack.length).toBe(3);
    // oldest ('a') was trimmed
    stack.undo();
    stack.undo();
    expect(stack.current()!.value).toBe('b');
    expect(stack.undo()).toBeNull(); // can't go before 'b'
  });

  it('clear resets the stack', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a', cursorPos: 1 });
    stack.push({ value: 'b', cursorPos: 1 });
    stack.clear();
    expect(stack.length).toBe(0);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });

  it('multiple undo/redo cycles work correctly', () => {
    const stack = new UndoStack();
    stack.push({ value: '', cursorPos: 0 });
    stack.push({ value: 'h', cursorPos: 1 });
    stack.push({ value: 'he', cursorPos: 2 });
    stack.push({ value: 'hel', cursorPos: 3 });

    expect(stack.undo()!.value).toBe('he');
    expect(stack.undo()!.value).toBe('h');
    expect(stack.redo()!.value).toBe('he');
    expect(stack.redo()!.value).toBe('hel');
    expect(stack.redo()).toBeNull();
  });

  it('preserves selStart on entries for selection-aware undo', () => {
    const stack = new UndoStack();
    stack.push({ value: 'a foo b', cursorPos: 5 });
    // Simulate user selecting "foo" then surrouding → snapshot selection on current entry
    const cur = stack.current()!;
    cur.selStart = 2;
    cur.cursorPos = 5;
    // Push post-surround state with inner selection
    stack.push({ value: 'a (foo) b', cursorPos: 6, selStart: 3 });

    // Undo should restore pre-surround entry with selection info
    const entry = stack.undo()!;
    expect(entry.value).toBe('a foo b');
    expect(entry.selStart).toBe(2);
    expect(entry.cursorPos).toBe(5);

    // Redo should restore post-surround entry with inner selection
    const redo = stack.redo()!;
    expect(redo.value).toBe('a (foo) b');
    expect(redo.selStart).toBe(3);
    expect(redo.cursorPos).toBe(6);
  });

  it('entries without selStart behave as collapsed cursor', () => {
    const stack = new UndoStack();
    stack.push({ value: 'hello', cursorPos: 5 });
    stack.push({ value: 'hello world', cursorPos: 11 });
    const entry = stack.undo()!;
    expect(entry.selStart).toBeUndefined();
    expect(entry.cursorPos).toBe(5);
  });
});
