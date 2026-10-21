import * as React from 'react';

/**
 * Runs `callback` whenever something anchored to page content may have
 * moved: window resize, any scroll (capture phase, so scrolling ancestors
 * count), visual-viewport resize and scroll (the on-screen keyboard, pinch
 * zoom), and — with `anchorRef` — the anchor's own size changes. Listeners
 * are attached once; the latest callback is always the one that runs.
 */
export function useReposition(callback: () => void, anchorRef?: React.RefObject<Element>, enabled = true): void {
  const callbackRef = React.useRef(callback);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref pattern
  callbackRef.current = callback;
  React.useEffect(() => {
    if (!enabled) return; // a component that sometimes renders in flow instead
    const run = () => callbackRef.current();
    const vv = window.visualViewport;
    window.addEventListener('resize', run);
    window.addEventListener('scroll', run, true);
    vv?.addEventListener('resize', run);
    vv?.addEventListener('scroll', run);
    const anchor = anchorRef?.current ?? null;
    const observer = anchor && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(run) : null;
    if (anchor) observer?.observe(anchor);
    return () => {
      window.removeEventListener('resize', run);
      window.removeEventListener('scroll', run, true);
      vv?.removeEventListener('resize', run);
      vv?.removeEventListener('scroll', run);
      observer?.disconnect();
    };
  }, [anchorRef, enabled]);
}
