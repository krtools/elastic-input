/**
 * Minimal React 16 render helper for browser tests.
 * Renders into a fresh container, returns cleanup function.
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';

let container: HTMLDivElement | null = null;

export function renderInto(element: React.ReactElement): HTMLDivElement {
  cleanup();
  container = document.createElement('div');
  document.body.appendChild(container);
  ReactDOM.render(element, container);
  return container;
}

export function cleanup() {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
}
