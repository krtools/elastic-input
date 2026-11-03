/**
 * Shared helpers for the browser tests: polling, pausing and querying.
 * (Rendering lives in renderHelper.)
 */
import { commands } from 'vitest/browser';
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

export type MouseStep = { type: 'move'; x: number; y: number } | { type: 'down' | 'up'; clickCount?: number } | { type: 'wait'; ms: number };

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** Real pointer input (vitest.browser.config.ts): coordinates are this frame's CSS pixels. */
    mouseGesture: (steps: MouseStep[]) => Promise<void>;
  }
}

/**
 * A real `clicks`-click press at `from` dragged to `to` and released, with
 * trusted events and the browser's own default actions. The synthetic mouse
 * events above carry no click count the browser believes. The earlier clicks
 * are spaced as a hand would: back to back, React would flush the first
 * click's highlight rebuild at the next mousedown and replace that event's
 * target before the handler sees it.
 */
export async function realMultiClickDrag(el: HTMLElement, from: number, to: number, clicks: number): Promise<void> {
  const a = pointAt(el, from);
  const b = pointAt(el, to);
  const steps: MouseStep[] = [{ type: 'move', x: a.x, y: a.y }];
  for (let i = 1; i < clicks; i++) steps.push({ type: 'down', clickCount: i }, { type: 'up', clickCount: i }, { type: 'wait', ms: 50 });
  steps.push(
    { type: 'down', clickCount: clicks },
    { type: 'move', x: (a.x + b.x) / 2, y: b.y },
    { type: 'move', x: b.x, y: b.y },
    { type: 'up', clickCount: clicks },
  );
  await commands.mouseGesture(steps);
}
