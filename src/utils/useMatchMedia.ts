import * as React from 'react';

/** True while the media query matches; false where matchMedia is unavailable (SSR). */
export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = React.useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  );
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
