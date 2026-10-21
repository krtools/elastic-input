import * as React from 'react';

/**
 * A `<div>` appended to `document.body` for the life of the component, to
 * render portals into. `null` on the first render — the element is created
 * in an effect — after which the component renders once more with it.
 * `enabled: false` creates nothing and returns `null` (a component that
 * sometimes renders in flow instead).
 */
export function useBodyPortal(enabled = true): HTMLDivElement | null {
  const [el, setEl] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    const container = document.createElement('div');
    document.body.appendChild(container);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the container is created imperatively on mount; one deliberate re-render once it exists
    setEl(container);
    return () => {
      document.body.removeChild(container);
      setEl(null);
    };
  }, [enabled]);
  return enabled ? el : null;
}
