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

/**
 * Scroll the editor so the caret is visible within its scrollable area.
 */
export function scrollEditorToCaret(editor: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  let rect = range.getBoundingClientRect();

  // For empty lines the range rect is zero-sized; use a temp span
  if (rect.width === 0 && rect.height === 0) {
    const span = document.createElement('span');
    span.textContent = '\u200b';
    range.insertNode(span);
    rect = span.getBoundingClientRect();
    span.parentNode?.removeChild(span);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const editorRect = editor.getBoundingClientRect();
  const caretTop = rect.top - editorRect.top + editor.scrollTop;
  const caretBottom = rect.bottom - editorRect.top + editor.scrollTop;

  if (caretBottom > editor.scrollTop + editor.clientHeight) {
    editor.scrollTop = caretBottom - editor.clientHeight;
  } else if (caretTop < editor.scrollTop) {
    editor.scrollTop = caretTop;
  }
}

export function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Use a zero-width-space probe when the range rect is unreliable:
  // 1. Zero dimensions (empty line, empty container)
  // 2. Caret right after a <br> — browsers report the rect at the <br>'s
  //    line rather than the new line the caret is visually on
  const needsProbe = (rect.width === 0 && rect.height === 0) ||
    (range.collapsed && range.startContainer.nodeType === Node.ELEMENT_NODE &&
     range.startOffset > 0 &&
     range.startContainer.childNodes[range.startOffset - 1]?.nodeName === 'BR');

  if (needsProbe) {
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

export interface DropdownPosition {
  top: number;
  left: number;
  /**
   * True when the dropdown is flipped above the caret. In that case `top` is
   * the anchor for the dropdown's BOTTOM edge — the renderer must apply
   * `transform: translateY(-100%)` so the browser pins the bottom edge there
   * regardless of the dropdown's actual rendered height. (dropdownHeight is
   * only an estimate; using it to precompute the top edge left a gap whenever
   * custom styles made rows shorter than the estimate.)
   */
  flipped?: boolean;
}

export function getDropdownPosition(
  caretRect: DOMRect,
  dropdownHeight: number,
  dropdownWidth: number
): DropdownPosition {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  let top = caretRect.bottom + window.scrollY + 4;
  let left = caretRect.left + window.scrollX;
  let flipped = false;

  // Flip above if no room below — anchor the bottom edge just above the caret
  if (caretRect.bottom + dropdownHeight + 4 > viewportHeight) {
    top = caretRect.top + window.scrollY - 4;
    flipped = true;
  }

  // Prevent overflow right
  if (left + dropdownWidth > viewportWidth) {
    left = viewportWidth - dropdownWidth - 8;
  }

  // Prevent overflow left
  if (left < 8) {
    left = 8;
  }

  return { top, left, flipped };
}

/**
 * Re-evaluate the flip decision once the dropdown's actual rendered height is
 * known. The initial decision is based on an estimated height (32px per
 * suggestion row, 350px for the date picker), which custom content — tall
 * renderFieldHint panels especially — can far exceed. Returns a corrected
 * position, or null when the current placement stands. Only switches direction
 * when the other side actually fits, so repeated application converges.
 */
export function adjustFlippedPosition(
  position: DropdownPosition,
  actualHeight: number,
  caretRect: DOMRect,
  viewportHeight: number,
  scrollY: number,
): DropdownPosition | null {
  if (position.flipped) {
    const overflowsAbove = caretRect.top - 4 - actualHeight < 0;
    const fitsBelow = caretRect.bottom + 4 + actualHeight <= viewportHeight;
    if (overflowsAbove && fitsBelow) {
      return { ...position, top: caretRect.bottom + scrollY + 4, flipped: false };
    }
  } else {
    const overflowsBelow = caretRect.bottom + 4 + actualHeight > viewportHeight;
    const fitsAbove = caretRect.top - 4 - actualHeight >= 0;
    if (overflowsBelow && fitsAbove) {
      return { ...position, top: caretRect.top + scrollY - 4, flipped: true };
    }
  }
  return null;
}
