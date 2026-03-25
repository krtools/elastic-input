/**
 * Insert text at the current selection/cursor, replacing any selected content.
 * Uses the modern Range API instead of the deprecated document.execCommand.
 */
export function insertTextAtCursor(text: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const textNode = document.createTextNode(text);
  range.insertNode(textNode);

  // Move cursor to end of inserted text
  range.setStartAfter(textNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Insert a line break (<br>) at the current selection/cursor.
 * Uses the modern Range API instead of the deprecated document.execCommand.
 */
export function insertLineBreakAtCursor(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const br = document.createElement('br');
  range.insertNode(br);

  // Move cursor after the <br>
  range.setStartAfter(br);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // If range rect has zero dimensions (e.g., empty line), use a fallback
  if (rect.width === 0 && rect.height === 0) {
    const span = document.createElement('span');
    span.textContent = '\u200b'; // zero-width space
    range.insertNode(span);
    const spanRect = span.getBoundingClientRect();
    span.parentNode?.removeChild(span);
    // Normalize the selection
    sel.removeAllRanges();
    sel.addRange(range);
    return spanRect;
  }

  return rect;
}

export function getContainerOffset(container: HTMLElement): { top: number; left: number } {
  const rect = container.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
  };
}

/**
 * Cap the height used for dropdown positioning to the rendered max height.
 * The CSS maxHeight clips the dropdown visually, but the flip logic needs
 * the actual rendered size to avoid positioning the dropdown off-screen.
 */
export function capDropdownHeight(contentHeight: number, maxHeightPx: number): number {
  return Math.min(contentHeight, maxHeightPx);
}

export function getDropdownPosition(
  caretRect: DOMRect,
  dropdownHeight: number,
  dropdownWidth: number
): { top: number; left: number } {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  let top = caretRect.bottom + window.scrollY + 4;
  let left = caretRect.left + window.scrollX;

  // Flip above if no room below
  if (caretRect.bottom + dropdownHeight + 4 > viewportHeight) {
    top = caretRect.top + window.scrollY - dropdownHeight - 4;
  }

  // Prevent overflow right
  if (left + dropdownWidth > viewportWidth) {
    left = viewportWidth - dropdownWidth - 8;
  }

  // Prevent overflow left
  if (left < 8) {
    left = 8;
  }

  return { top, left };
}
