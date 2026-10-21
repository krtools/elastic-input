import { getVisibleViewport, VisibleViewport } from './viewport';
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
  /**
   * Vertical space available on the chosen side (visible viewport minus
   * margins). Renderers cap their height to it so the list scrolls instead
   * of leaving the screen — with the on-screen keyboard up, neither side may
   * fit the full list.
   */
  maxHeight?: number;
}

/** Below this the list is not usable; overflow instead. */
const MIN_DROPDOWN_SPACE = 96;
const CARET_GAP = 4;
const EDGE_MARGIN = 8;

/**
 * Where a floating box goes for an anchor rect (the caret, or the input
 * container for full-width boxes such as the bar): below it unless only
 * above fits, else the roomier side. `gap` is the space between anchor and box.
 */
export function getDropdownPosition(
  caretRect: DOMRect,
  dropdownHeight: number,
  dropdownWidth: number,
  viewport: VisibleViewport = getVisibleViewport(),
  gap: number = CARET_GAP,
): DropdownPosition {
  const viewportBottom = viewport.top + viewport.height;
  const viewportRight = viewport.left + viewport.width;
  const spaceBelow = viewportBottom - caretRect.bottom - gap - EDGE_MARGIN;
  const spaceAbove = caretRect.top - gap - viewport.top - EDGE_MARGIN;

  // Below unless only above fits; when neither fits, the roomier side. Flipped
  // anchors the bottom edge just above the caret.
  const flipped = dropdownHeight > spaceBelow && (dropdownHeight <= spaceAbove || spaceAbove > spaceBelow);
  const top = flipped ? caretRect.top + window.scrollY - gap : caretRect.bottom + window.scrollY + gap;
  const maxHeight = Math.max(MIN_DROPDOWN_SPACE, Math.floor(flipped ? spaceAbove : spaceBelow));
  let clientLeft = caretRect.left;

  // Keep inside the visible viewport horizontally
  if (clientLeft + dropdownWidth > viewportRight) {
    clientLeft = viewportRight - dropdownWidth - 8;
  }
  if (clientLeft < viewport.left + 8) {
    clientLeft = viewport.left + 8;
  }

  return { top, left: clientLeft + window.scrollX, flipped, maxHeight };
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
  viewport: Pick<VisibleViewport, 'top' | 'height'>,
  scrollY: number,
): DropdownPosition | null {
  const viewportBottom = viewport.top + viewport.height;
  const spaceBelow = viewportBottom - caretRect.bottom - CARET_GAP - EDGE_MARGIN;
  const spaceAbove = caretRect.top - CARET_GAP - viewport.top - EDGE_MARGIN;
  if (position.flipped) {
    const overflowsAbove = caretRect.top - CARET_GAP - actualHeight < viewport.top;
    const fitsBelow = caretRect.bottom + CARET_GAP + actualHeight <= viewportBottom;
    if (overflowsAbove && fitsBelow) {
      return { ...position, top: caretRect.bottom + scrollY + CARET_GAP, flipped: false, maxHeight: Math.max(MIN_DROPDOWN_SPACE, Math.floor(spaceBelow)) };
    }
  } else {
    const overflowsBelow = caretRect.bottom + CARET_GAP + actualHeight > viewportBottom;
    const fitsAbove = caretRect.top - CARET_GAP - actualHeight >= viewport.top;
    if (overflowsBelow && fitsAbove) {
      return { ...position, top: caretRect.top + scrollY - CARET_GAP, flipped: true, maxHeight: Math.max(MIN_DROPDOWN_SPACE, Math.floor(spaceAbove)) };
    }
  }
  return null;
}
