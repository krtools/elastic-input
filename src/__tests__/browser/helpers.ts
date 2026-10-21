/**
 * Shared helpers for the browser tests: polling, pausing and querying.
 * (Rendering lives in renderHelper.)
 */

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
