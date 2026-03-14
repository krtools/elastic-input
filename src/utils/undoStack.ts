export interface UndoEntry {
  value: string;
  cursorPos: number;
}

export class UndoStack {
  private stack: UndoEntry[] = [];
  private index: number = -1;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /** Push a new state. Clears any redo entries ahead of current position. */
  push(entry: UndoEntry): void {
    // Don't push if identical to current
    if (this.index >= 0 && this.stack[this.index].value === entry.value) {
      // Just update cursor position
      this.stack[this.index].cursorPos = entry.cursorPos;
      return;
    }

    // Discard redo entries
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(entry);

    // Trim oldest entries if exceeding max size
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }

    this.index = this.stack.length - 1;
  }

  /** Replace the current entry (used for grouping consecutive typing). */
  replaceCurrent(entry: UndoEntry): void {
    if (this.index >= 0) {
      this.stack[this.index] = entry;
    } else {
      this.push(entry);
    }
  }

  undo(): UndoEntry | null {
    if (this.index <= 0) return null;
    this.index--;
    return this.stack[this.index];
  }

  redo(): UndoEntry | null {
    if (this.index >= this.stack.length - 1) return null;
    this.index++;
    return this.stack[this.index];
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  current(): UndoEntry | null {
    return this.index >= 0 ? this.stack[this.index] : null;
  }

  clear(): void {
    this.stack = [];
    this.index = -1;
  }

  get length(): number {
    return this.stack.length;
  }
}
