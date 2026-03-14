export function getCaretCharOffset(element: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;

  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);

  return preRange.toString().length;
}

export function getSelectionCharRange(element: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };

  const range = sel.getRangeAt(0);

  const preRangeStart = range.cloneRange();
  preRangeStart.selectNodeContents(element);
  preRangeStart.setEnd(range.startContainer, range.startOffset);
  const start = preRangeStart.toString().length;

  const preRangeEnd = range.cloneRange();
  preRangeEnd.selectNodeContents(element);
  preRangeEnd.setEnd(range.endContainer, range.endOffset);
  const end = preRangeEnd.toString().length;

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

function findNodeAtOffset(
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
