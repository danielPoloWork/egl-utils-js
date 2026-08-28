// @vitest-environment jsdom
// Tests (roadmap 23.3, spec 09 §2 items F130-F131, §6) for grid keyboard
// navigation.
//
// The **movement matrix** is what this file exists for: which key, from which
// cell, reaches which cell — including the edges, where the requirement is that
// nothing happens. jsdom answers all of that, because the model is indices into
// rows and cells and owes nothing to layout.
//
// What jsdom cannot answer is in the Playwright suite: that focus really lands
// where the model says, that the cell is scrolled into view, and that one `Tab`
// from outside reaches the grid and one more leaves it. Those are questions about
// an engine, and F121 and F123 are proved there for the same reason.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bsTable } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';

const ROWS = [
  { a: 'a1', b: 'b1', c: 'c1' },
  { a: 'a2', b: 'b2', c: 'c2' },
  { a: 'a3', b: 'b3', c: 'c3' },
];

const COLUMNS = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

/** @type {Element} */
let host;
/** @type {(() => void)[]} */
let teardown;

/** @param {object} [options] */
function table(options = {}) {
  const instance = bsTable(host, { columns: COLUMNS, data: ROWS, keyboard: true, ...options });
  teardown.push(() => instance.destroy());
  return instance;
}

/** The cell that currently holds the grid's single tab stop. */
const stop = () => host.querySelector('[tabindex="0"]');

/** A readable name for a cell: its text, so the matrix below reads as a map. */
const at = () => stop()?.textContent?.replace(/\s/g, '') ?? null;

/** Every tab stop inside the table, which F130 says is exactly one. */
const stops = () => host.querySelectorAll('table [tabindex="0"]');

/**
 * Press a key on whatever holds the tab stop, as a user would.
 *
 * @param {string} key
 * @param {object} [modifiers]
 * @returns {Event}
 */
function press(key, modifiers = {}) {
  const target = /** @type {Element} */ (stop());
  const event = new window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * Move the tab stop onto a body cell by walking there, so every test starts from
 * a stated position rather than from the grid's entry point.
 *
 * @param {number} row - 0-based body row.
 * @param {number} column - 0-based cell within the row.
 */
function goTo(row, column) {
  press('Home', { ctrlKey: true });
  for (let i = 0; i <= row; i += 1) press('ArrowDown');
  for (let i = 0; i < column; i += 1) press('ArrowRight');
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = /** @type {Element} */ (document.getElementById('host'));
  teardown = [];
});

afterEach(() => {
  for (const fn of teardown) fn();
  document.body.innerHTML = '';
});

describe('off by default', () => {
  it('adds no role and takes no tab stop', () => {
    const instance = bsTable(host, { columns: COLUMNS, data: ROWS });
    teardown.push(() => instance.destroy());
    expect(instance.table.getAttribute('role')).toBe(null);
    expect(stops()).toHaveLength(0);
  });

  it('leaves the F99 grip and the F100 handle their own tab stops', () => {
    const instance = bsTable(host, { columns: COLUMNS, data: ROWS, resize: true, reorder: true });
    teardown.push(() => instance.destroy());
    expect(host.querySelector('[data-egl-resize]')?.getAttribute('tabindex')).toBe('0');
    expect(host.querySelector('[data-egl-move]')?.getAttribute('tabindex')).toBe('0');
  });
});

describe('one tab stop, and it is a cell', () => {
  it('marks the table a grid and puts the stop on the first cell', () => {
    const instance = table();
    expect(instance.table.getAttribute('role')).toBe('grid');
    expect(stops()).toHaveLength(1);
    expect(at()).toBe('a');
  });

  it('is still exactly one stop after the arrows have moved it', () => {
    table();
    press('ArrowDown');
    press('ArrowRight');
    expect(stops()).toHaveLength(1);
    expect(at()).toBe('b1');
  });

  it('takes the tab stop from every control the table renders', () => {
    // Twelve tab stops without F130 — one grip, one handle and one checkbox per
    // column and row — and one with it.
    const instance = table({ resize: true, reorder: true, rowKey: 'a', selection: true });
    expect(host.querySelector('[data-egl-resize]')?.getAttribute('tabindex')).toBe('-1');
    expect(host.querySelector('[data-egl-move]')?.getAttribute('tabindex')).toBe('-1');
    expect(host.querySelector('input[data-egl-select]')?.getAttribute('tabindex')).toBe('-1');
    expect(stops()).toHaveLength(1);
    void instance;
  });

  it("takes it from the caller's own controls too", () => {
    table({
      columns: [
        { key: 'a', format: (value) => `${value}` },
        {
          key: 'b',
          format: (value) => {
            const link = document.createElement('a');
            link.href = '/x';
            link.textContent = `${value}`;
            return link;
          },
        },
      ],
    });
    expect(host.querySelector('tbody a')?.getAttribute('tabindex')).toBe('-1');
    expect(stops()).toHaveLength(1);
  });

  it('takes it from the F67 filter inputs', () => {
    table({ controls: { filterRow: true } });
    expect(host.querySelector('thead input')?.getAttribute('tabindex')).toBe('-1');
    expect(stops()).toHaveLength(1);
  });

  it('declines the tab stop Firefox gives a scrollable container', () => {
    // Found by the three-engine suite rather than reasoned about: Firefox puts a
    // scrollable region in the tab order so a keyboard user can reach it, which
    // made the grid two tab stops there and one everywhere else. Moving the cell
    // focus is what scrolls this container now, so the reason no longer applies.
    const instance = table({ responsive: true, sticky: { maxHeight: '120px' } });
    expect(instance.element.getAttribute('tabindex')).toBe('-1');
    void instance;
  });

  it('does not make a row a tab stop when onRowClick is set', () => {
    table({ onRowClick: () => {} });
    expect(host.querySelector('tbody tr')?.getAttribute('tabindex')).toBe(null);
    expect(stops()).toHaveLength(1);
  });
});

describe('the movement matrix', () => {
  it('walks the header row and stops at both ends', () => {
    table();
    expect(at()).toBe('a');
    press('ArrowLeft');
    expect(at()).toBe('a'); // the left edge holds
    press('ArrowRight');
    expect(at()).toBe('b');
    press('ArrowRight');
    expect(at()).toBe('c');
    press('ArrowRight');
    expect(at()).toBe('c'); // and so does the right one
  });

  it('walks down into the body and stops at the last row', () => {
    table();
    press('ArrowUp');
    expect(at()).toBe('a'); // the header is the top
    press('ArrowDown');
    expect(at()).toBe('a1');
    press('ArrowDown');
    press('ArrowDown');
    expect(at()).toBe('a3');
    press('ArrowDown');
    expect(at()).toBe('a3');
  });

  it('keeps the column while moving between rows', () => {
    table();
    goTo(0, 2);
    expect(at()).toBe('c1');
    press('ArrowDown');
    expect(at()).toBe('c2');
    press('ArrowUp');
    expect(at()).toBe('c1');
  });

  it('Home and End reach the row ends', () => {
    table();
    goTo(1, 1);
    press('End');
    expect(at()).toBe('c2');
    press('Home');
    expect(at()).toBe('a2');
  });

  it('Ctrl+Home and Ctrl+End reach the table ends', () => {
    table();
    goTo(1, 1);
    press('End', { ctrlKey: true });
    expect(at()).toBe('c3');
    press('Home', { ctrlKey: true });
    expect(at()).toBe('a');
  });

  it('accepts Meta for Ctrl, because one of them is the platform', () => {
    table();
    goTo(0, 0);
    press('End', { metaKey: true });
    expect(at()).toBe('c3');
  });

  it('PageDown and PageUp move by rows and clamp like the arrows', () => {
    // jsdom has no layout, so the measured jump falls back to its documented
    // constant — which is larger than this table, so both keys reach an edge.
    table();
    goTo(0, 0);
    press('PageDown');
    expect(at()).toBe('a3');
    press('PageUp');
    expect(at()).toBe('a');
  });

  it('takes a fixed jump when the caller names one', () => {
    table({ keyboard: { pageRows: 1 } });
    goTo(0, 0);
    press('PageDown');
    expect(at()).toBe('a2');
  });

  it('clamps the column on a row that has fewer cells', () => {
    // The empty-state row is one `colspan` cell, and a column index carried into
    // it would land on nothing.
    table({ data: [], empty: 'nothing' });
    goTo(-1, 2);
    expect(at()).toBe('c');
    press('ArrowDown');
    expect(at()).toBe('nothing');
    press('ArrowUp');
    expect(at()).toBe('a');
  });

  it('counts the F95 selection column as a cell of its own', () => {
    table({ rowKey: 'a', selection: true });
    press('Home', { ctrlKey: true });
    expect(stop()?.tagName).toBe('TH');
    press('ArrowRight');
    expect(at()).toBe('a');
  });

  it('consumes only the keys it acts on', () => {
    table();
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(press('End').defaultPrevented).toBe(true);
    // A letter is the caller's — a type-ahead, a shortcut, anything.
    expect(press('x').defaultPrevented).toBe(false);
  });

  it('does not turn the page', () => {
    const instance = table({ pageSize: 2 });
    goTo(1, 0);
    expect(at()).toBe('a2');
    press('ArrowDown');
    press('PageDown');
    press('End', { ctrlKey: true });
    // Still page one: an arrow key that fetches data is a surprise (F130).
    expect(instance.pipeline.view().page).toBe(1);
    expect(at()).toBe('c2');
  });
});

describe('a cell hands the keyboard to what is inside it (F131)', () => {
  it('Enter focuses the cell control and Escape comes back', () => {
    table({ rowKey: 'a', selection: true });
    goTo(0, 0);
    // The selection cell is the leading one, so Home reaches it.
    press('Home');
    press('Enter');
    const box = host.querySelector('tbody input[data-egl-select]');
    expect(document.activeElement).toBe(box);

    const escape = new window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    /** @type {Element} */ (box).dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stop());
  });

  it('leaves every other key to the control it entered — Tab included', () => {
    table({ rowKey: 'a', selection: true });
    press('Home');
    press('ArrowDown');
    press('Enter');
    const box = /** @type {Element} */ (host.querySelector('tbody input[data-egl-select]'));
    for (const key of ['Tab', 'ArrowRight', 'ArrowDown', 'Home', 'PageDown']) {
      const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      box.dispatchEvent(event);
      expect(event.defaultPrevented, `${key} inside an entered cell is the control's`).toBe(false);
    }
  });

  it('leaves the F99 grip and the F100 handle their own arrow keys', () => {
    const instance = table({ resize: true, reorder: true });
    const handle = /** @type {any} */ (host.querySelector('[data-egl-move="a"]'));
    handle.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    // The handle moved the column; the grid did not move the focus.
    expect(instance.getColumnOrder()).toEqual(['b', 'a', 'c']);
  });

  it('activates the row from a cell that has no control of its own', () => {
    const onRowClick = vi.fn();
    table({ onRowClick });
    goTo(0, 1);
    press('Enter');
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0]).toEqual(ROWS[0]);
  });

  it('does not activate a row from the header', () => {
    const onRowClick = vi.fn();
    table({ onRowClick });
    press('Enter');
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('the tab stop survives what the table does to itself', () => {
  it('comes back after a re-render replaced every row', () => {
    const instance = table();
    goTo(1, 1);
    expect(at()).toBe('b2');
    instance.setData([{ a: 'z1', b: 'z2', c: 'z3' }]);
    // The node that held it is gone, so the grid would have none at all — and a
    // grid with no tab stop is unreachable.
    expect(stops()).toHaveLength(1);
    expect(at()).toBe('a');
  });

  it('stays on a header cell across a re-render, because that node survived', () => {
    const instance = table();
    press('ArrowRight');
    expect(at()).toBe('b');
    instance.setData([{ a: 'z1', b: 'z2', c: 'z3' }]);
    expect(at()).toBe('b');
  });

  it('survives a column being hidden and shown (F128)', () => {
    const instance = table();
    goTo(0, 1);
    instance.hideColumn('b');
    expect(stops()).toHaveLength(1);
    instance.showColumn('b');
    expect(stops()).toHaveLength(1);
  });

  it('demotes the controls of rows rendered after the first paint', () => {
    const instance = table({ rowKey: 'a', selection: true });
    instance.setData([{ a: 'z1', b: 'z2', c: 'z3' }]);
    expect(host.querySelector('tbody input[data-egl-select]')?.getAttribute('tabindex')).toBe('-1');
    expect(stops()).toHaveLength(1);
  });

  it('follows a pointer that focused a control in another cell', () => {
    table({ rowKey: 'a', selection: true });
    goTo(0, 2);
    const box = /** @type {any} */ (host.querySelectorAll('tbody input[data-egl-select]')[2]);
    box.focus();
    // The stop followed the focus, so Escape returns where the user actually is.
    expect(stop()).toBe(box.closest('td'));
    expect(stops()).toHaveLength(1);
  });
});

describe('what it refuses', () => {
  it('rejects a key it does not know, and a malformed pageRows', () => {
    expect(() => table({ keyboard: { pageRow: 4 } })).toThrow(
      /bsTable\.keyboard: unknown option 'pageRow'/,
    );
    expect(() => table({ keyboard: { pageRows: 0 } })).toThrow(
      'bsTable: options.keyboard.pageRows must be an integer >= 1',
    );
    expect(() => table({ keyboard: { pageRows: 1.5 } })).toThrow(TypeError);
  });

  it('stops listening after destroy()', () => {
    const instance = table();
    const cell = /** @type {Element} */ (stop());
    instance.destroy();
    const event = new window.KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    cell.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
