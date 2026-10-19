/** The visible part of the page, in the same coordinates as getBoundingClientRect. */
export interface VisibleViewport {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Visual viewport when available, else the window. With the on-screen
 * keyboard up, window.innerHeight is unchanged on iOS and on Android
 * (interactive-widget=resizes-visual); only the visual viewport shrinks, so
 * anything positioned against innerHeight can land under the keyboard.
 */
export function getVisibleViewport(): VisibleViewport {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) return { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height };
  return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

/**
 * When `dropdown.presentation: 'auto'` picks the sheet: phones in portrait by
 * width, phones in landscape by height on a coarse pointer (tablets, whose
 * short side is 768px or more, fall through to the floating dropdown).
 */
export const SHEET_MEDIA_QUERY = '(max-width: 640px), ((pointer: coarse) and (max-height: 500px))';
