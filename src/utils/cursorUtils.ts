/**
 * Count character offset from the start of root to a specific DOM position,
 * treating <br> elements as single newline characters.
 */
function countOffsetTo(root: Node, targetNode: Node, targetOffset: number): number {
  let count = 0;
  let found = false;

  function walk(node: Node): boolean {
    if (found) return true;

    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        count += targetOffset;
      } else {
        // Element node — walk children up to targetOffset
        for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) {
          if (walk(node.childNodes[i])) return true;
        }
      }
      found = true;
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      count += (node.textContent || '').length;
      return false;
    }

    if (node.nodeName === 'BR') {
      count += 1;
      return false;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true;
    }
    return false;
  }

  walk(root);
  return count;
}

export function getCaretCharOffset(element: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;

  const range = sel.getRangeAt(0);
  return countOffsetTo(element, range.startContainer, range.startOffset);
}

export function getSelectionCharRange(element: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };

  const range = sel.getRangeAt(0);
  const start = countOffsetTo(element, range.startContainer, range.startOffset);
  const end = countOffsetTo(element, range.endContainer, range.endOffset);

  return { start, end };
}

export function setCaretCharOffset(element: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;

  const result = findNodeAtOffset(element, offset);
  if (!result) return;

  const range = document.createRange();
  range.setStart(result.node, result.offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Set a non-collapsed selection range by character offsets within a contentEditable element. */
export function setSelectionCharRange(element: HTMLElement, start: number, end: number): void {
  if (start === end) {
    setCaretCharOffset(element, start);
    return;
  }
  const sel = window.getSelection();
  if (!sel) return;

  const startResult = findNodeAtOffset(element, start);
  const endResult = findNodeAtOffset(element, end);
  if (!startResult || !endResult) return;

  const range = document.createRange();
  range.setStart(startResult.node, startResult.offset);
  range.setEnd(endResult.node, endResult.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Find the DOM node and offset corresponding to a character offset,
 * treating <br> elements as single newline characters.
 */
export function findNodeAtOffset(
  parent: Node,
  targetOffset: number
): { node: Node; offset: number } | null {
  let currentOffset = 0;

  function walk(node: Node): { node: Node; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (currentOffset + len >= targetOffset) {
        return { node, offset: targetOffset - currentOffset };
      }
      currentOffset += len;
      return null;
    }

    if (node.nodeName === 'BR') {
      if (currentOffset + 1 >= targetOffset) {
        // Position after the <br> — place cursor at start of next sibling
        const parentNode = node.parentNode;
        if (parentNode) {
          const idx = Array.from(parentNode.childNodes).indexOf(node as ChildNode);
          return { node: parentNode, offset: idx + 1 };
        }
      }
      currentOffset += 1;
      return null;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      const result = walk(node.childNodes[i]);
      if (result) return result;
    }

    return null;
  }

  const result = walk(parent);
  if (result) return result;

  // If we couldn't find the exact offset, place at the end
  const lastChild = getLastTextNode(parent);
  if (lastChild) {
    return { node: lastChild, offset: (lastChild.textContent || '').length };
  }

  return { node: parent, offset: 0 };
}

function getLastTextNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return node;
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const result = getLastTextNode(node.childNodes[i]);
    if (result) return result;
  }
  return null;
}
