import { defineConfig } from 'vitest/config';
import type { BrowserCommand } from 'vitest/node';
import { playwright } from '@vitest/browser-playwright';
import path from 'path';

type MouseStep = { type: 'move'; x: number; y: number } | { type: 'down' | 'up'; clickCount?: number } | { type: 'wait'; ms: number } | { type: 'key'; key: string };

/**
 * Real pointer input for the selection-drag tests: a press with a click count
 * and the drag that follows, which DOM-synthesized events cannot give. Step
 * coordinates are the test frame's CSS pixels; the frame may be offset and
 * scaled within the runner page.
 */
const mouseGesture: BrowserCommand<[steps: MouseStep[]]> = async ({ page, frame }, steps) => {
  const testFrame = await frame();
  const box = await (await testFrame.frameElement()).boundingBox();
  if (!box) throw new Error('The test frame has no box');
  const scale = box.width / await testFrame.evaluate(() => window.innerWidth);
  for (const step of steps) {
    if (step.type === 'wait') { await new Promise(r => setTimeout(r, step.ms)); continue; }
    if (step.type === 'key') { await page.keyboard.press(step.key); continue; }
    if (step.type === 'move') await page.mouse.move(box.x + step.x * scale, box.y + step.y * scale);
    else if (step.type === 'down') await page.mouse.down({ clickCount: step.clickCount });
    else await page.mouse.up({ clickCount: step.clickCount });
  }
};

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/__tests__/browser/**/*.test.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // Desktop size: the default (414px) is narrow enough to switch the
      // suggestions to the sheet presentation; phone tests set page.viewport()
      viewport: { width: 1280, height: 800 },
      instances: [{ browser: 'chromium' }],
      commands: { mouseGesture },
    },
  },
});
