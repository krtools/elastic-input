/**
 * Shared helpers for the browser tests: polling, pausing and querying.
 * (Rendering lives in renderHelper.)
 */
import { findNodeAtOffset } from '../../utils/cursorUtils';

/** Polls `fn` until it returns true, or the timeout passes (then false). */
export async function waitFor(fn: () => boolean | Promise<boolean>, timeout = 3000, interval = 50): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

export const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

export const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

/** Viewport point just inside the left edge of the character at `offset` in `root`. */
export function pointAt(root: HTMLElement, offset: number): { x: number; y: number } {
  const pos = findNodeAtOffset(root, offset);
  if (!pos) throw new Error(`No node at offset ${offset}`);
  const range = document.createRange();
  range.setStart(pos.node, pos.offset);
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  return { x: rect.left + 1, y: rect.top + rect.height / 2 };
}

/** Dispatches a mouse event at a viewport point; false when a handler prevented its default. */
export function mouseAt(target: EventTarget, type: string, point: { x: number; y: number }, init: MouseEventInit = {}): boolean {
  return target.dispatchEvent(new MouseEvent(type, {
    clientX: point.x, clientY: point.y, bubbles: true, cancelable: true, ...init,
  }));
}
