/**
 * Standalone Calendar: pure controlled date grid — Dates in, Dates out,
 * no mode toggle, no presets, no query-syntax serialization.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { Calendar } from '../../components/Calendar';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

function dayButton(day: number): HTMLElement {
  // Day cells for other months exist too — match the first current-month cell
  const days = Array.from(document.querySelectorAll('.ei-datepicker-days .ei-datepicker-day'));
  const el = days.find(b => b.textContent === String(day) && (b as HTMLElement).style.opacity === '');
  if (!el) throw new Error(`day ${day} not found`);
  return el as HTMLElement;
}

function headerText(): string {
  return document.querySelector('.ei-datepicker-header')?.textContent ?? '';
}

describe('Calendar (standalone)', () => {
  it('renders no mode toggle and no presets', () => {
    renderInto(React.createElement(Calendar, {
      mode: 'single', start: null, onChange: () => {},
    }));
    expect(document.querySelector('.ei-calendar')).not.toBeNull();
    expect(document.querySelector('.ei-datepicker-toggle')).toBeNull();
    expect(document.querySelector('.ei-datepicker-presets')).toBeNull();
  });

  it('single mode: every click reports (date, null); end prop is ignored', async () => {
    const calls: [Date, Date | null][] = [];
    renderInto(React.createElement(Calendar, {
      mode: 'single',
      start: new Date(2026, 6, 10),
      end: new Date(2026, 6, 20), // ignored in single mode
      onChange: (s: Date, e: Date | null) => calls.push([s, e]),
    }));
    expect(headerText()).toContain('July 2026');

    await page.elementLocator(dayButton(15)).click();
    expect(calls.length).toBe(1);
    expect(calls[0][0].getTime()).toBe(new Date(2026, 6, 15).getTime());
    expect(calls[0][1]).toBeNull();
  });

  it('range mode: first click is not reported, second click reports sorted', async () => {
    const calls: [Date, Date | null][] = [];
    renderInto(React.createElement(Calendar, {
      mode: 'range',
      start: null,
      end: null,
      onChange: (s: Date, e: Date | null) => calls.push([s, e]),
    }));

    // Click a later day first, then an earlier one — result must be sorted
    await page.elementLocator(dayButton(20)).click();
    expect(calls.length).toBe(0);
    await page.elementLocator(dayButton(5)).click();
    expect(calls.length).toBe(1);
    const [s, e] = calls[0];
    expect(s.getDate()).toBe(5);
    expect(e!.getDate()).toBe(20);
  });

  it('follows controlled selection changes and navigates the view', async () => {
    function Harness() {
      const [start, setStart] = React.useState<Date | null>(new Date(2026, 6, 10));
      return React.createElement('div', null,
        React.createElement('button', {
          id: 'jump',
          onClick: () => setStart(new Date(2027, 11, 25)),
        }, 'jump'),
        React.createElement(Calendar, { mode: 'single', start, onChange: setStart }),
      );
    }
    renderInto(React.createElement(Harness));
    expect(headerText()).toContain('July 2026');

    await page.elementLocator(document.querySelector('#jump') as HTMLElement).click();
    expect(headerText()).toContain('December 2027');
  });

  it('renders children as a footer inside the calendar', async () => {
    const clicks: string[] = [];
    renderInto(React.createElement(
      Calendar,
      { mode: 'range', start: null, end: null, onChange: () => {} },
      React.createElement('button', { id: 'my-preset', onClick: () => clicks.push('preset') }, 'Last 7 days'),
    ));

    const preset = document.querySelector('.ei-calendar #my-preset') as HTMLElement;
    expect(preset).not.toBeNull();
    await page.elementLocator(preset).click();
    expect(clicks).toEqual(['preset']);
  });

  it('month/year drill-down navigates without firing onChange', async () => {
    const calls: unknown[] = [];
    renderInto(React.createElement(Calendar, {
      mode: 'single', start: new Date(2026, 6, 10), onChange: (...a: unknown[]) => calls.push(a),
    }));

    // Zoom out to months (the header label is its only direct button child)
    await page.elementLocator(document.querySelector('.ei-datepicker-header > button') as HTMLElement).click();
    expect(headerText()).toContain('2026');
    const march = Array.from(document.querySelectorAll('.ei-calendar button')).find(b => b.textContent === 'Mar') as HTMLElement;
    await page.elementLocator(march).click();
    expect(headerText()).toContain('March 2026');
    expect(calls.length).toBe(0);
  });
});

describe('DateRangePicker composition via ElasticInput', () => {
  const FIELDS: FieldConfig[] = [{ name: 'created', label: 'Created', type: 'date' }];

  async function openPicker() {
    renderInto(React.createElement(ElasticInput, { fields: FIELDS }));
    const editor = page.elementLocator(document.querySelector('.ei-editor') as HTMLElement);
    await editor.click();
    await userEvent.type(editor, 'created:');
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !document.querySelector('.ei-datepicker')) {
      await new Promise(r => setTimeout(r, 50));
    }
    expect(document.querySelector('.ei-datepicker')).not.toBeNull();
  }

  it('renders toggle + calendar + presets, and a day click inserts the date', async () => {
    await openPicker();
    expect(document.querySelector('.ei-datepicker .ei-datepicker-toggle')).not.toBeNull();
    expect(document.querySelector('.ei-datepicker .ei-calendar')).not.toBeNull();

    await page.elementLocator(dayButton(15)).click();
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !/15/.test(document.querySelector('.ei-editor')?.textContent ?? '')) {
      await new Promise(r => setTimeout(r, 50));
    }
    expect(document.querySelector('.ei-editor')?.textContent).toMatch(/^created:\d{4}-\d{2}-15 $/);
  });

  it('range mode: toggle switches, preset click inserts its query value', async () => {
    await openPicker();
    const rangeBtn = Array.from(document.querySelectorAll('.ei-datepicker-toggle button'))
      .find(b => b.textContent === 'Range') as HTMLElement;
    await page.elementLocator(rangeBtn).click();

    const preset = Array.from(document.querySelectorAll('.ei-datepicker-presets button'))
      .find(b => b.textContent === 'Last 7 days') as HTMLElement;
    expect(preset).not.toBeNull();
    await page.elementLocator(preset).click();
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !(document.querySelector('.ei-editor')?.textContent ?? '').includes('now-7d')) {
      await new Promise(r => setTimeout(r, 50));
    }
    expect(document.querySelector('.ei-editor')?.textContent).toBe('created:[now-7d TO now] ');
  });
});
