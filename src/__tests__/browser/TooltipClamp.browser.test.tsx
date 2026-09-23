/**
 * Validation tooltip viewport clamping. The tooltip follows the mouse; near
 * the right edge it must stay fully on screen after every move.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const LONG_MESSAGE = 'This value is definitely not acceptable here, please choose something else entirely';

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Render the input hugging the right edge, type a bare term that fails validation. */
async function setupNearRightEdge() {
  renderInto(React.createElement(
    'div',
    { style: { position: 'absolute', left: window.innerWidth - 160, width: 150 } },
    React.createElement(ElasticInput, {
      fields: [{ name: 'status', type: 'string' }],
      validateValue: () => LONG_MESSAGE,
    }),
  ));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  await page.elementLocator(editorEl).click();
  await userEvent.type(page.elementLocator(editorEl), 'zzz ');
  expect(await waitFor(() => document.querySelector('.ei-squiggly') !== null)).toBe(true);
  const token = document.querySelector('.ei-token--value') as HTMLElement;
  return { editorEl, token };
}

function moveMouse(editorEl: HTMLElement, clientX: number, clientY: number) {
  editorEl.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
}

function tooltipRect(): DOMRect {
  const el = document.querySelector('.ei-tooltip') as HTMLElement;
  expect(el).not.toBeNull();
  return el.getBoundingClientRect();
}

const limit = () => window.innerWidth - 8;

// Regression tests: the clamp used to measure the tooltip with its previous
// translateX still applied and wrote the residual as the new absolute shift, so
// the settled position overflowed and successive moves oscillated.
describe('validation tooltip clamping', () => {
  it('first hover: settled position stays within the viewport', async () => {
    const { editorEl, token } = await setupNearRightEdge();
    const r = token.getBoundingClientRect();
    moveMouse(editorEl, r.left + 2, r.top + r.height / 2);
    await nextFrame();
    expect(tooltipRect().right).toBeLessThanOrEqual(limit());
  });

  it('the frame right after a mouse move is clamped', async () => {
    const { editorEl, token } = await setupNearRightEdge();
    const r = token.getBoundingClientRect();
    moveMouse(editorEl, r.left + 2, r.top + r.height / 2);
    // Synchronous read: React committed the new left, the clamp effect has not run
    expect(tooltipRect().right).toBeLessThanOrEqual(limit());
  });

  it('a second move while clamped stays clamped', async () => {
    const { editorEl, token } = await setupNearRightEdge();
    const r = token.getBoundingClientRect();
    const y = r.top + r.height / 2;
    moveMouse(editorEl, r.left + 2, y);
    await nextFrame();
    expect(tooltipRect().right).toBeLessThanOrEqual(limit()); // sanity: first clamp OK
    moveMouse(editorEl, r.left + 8, y);
    await nextFrame();
    expect(tooltipRect().right).toBeLessThanOrEqual(limit());
  });

  it('repeated moves at the same spot settle to one position', async () => {
    const { editorEl, token } = await setupNearRightEdge();
    const r = token.getBoundingClientRect();
    const y = r.top + r.height / 2;
    moveMouse(editorEl, r.left + 2, y);
    await nextFrame();
    moveMouse(editorEl, r.left + 8, y);
    await nextFrame();
    const rights: number[] = [];
    for (let i = 0; i < 4; i++) {
      moveMouse(editorEl, r.left + 8 + (i % 2 ? 0.5 : 0), y);
      await nextFrame();
      rights.push(Math.round(tooltipRect().right));
    }
    expect(new Set(rights).size).toBe(1);
  });
});
