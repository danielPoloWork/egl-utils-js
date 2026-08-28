// @vitest-environment jsdom
// Tests (roadmap 23.2, spec 09 §2 items F128-F129, §6) for column visibility and
// the chooser that drives it.
//
// The claim under test is a negative one, and it is the whole feature: hiding a
// column changes **rendering and nothing else**. The pipeline is never told, so
// sort, filter, search and page survive by construction — and the assertions
// below are what keeps "by construction" true. The other half is the refusal: a
// table with no columns is a state the chooser must not let a user reach, and the
// command behind it must not let a caller reach by accident either.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bsTable } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';
import { bindTableHistory } from '../../../../../main/javascript/it/d4np/utils/dom.js';

const ROWS = [
  { a: 'a1', b: 'b1', c: 'c1' },
  { a: 'a2', b: 'b2', c: 'c2' },
];

const COLUMNS = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

/** @type {Element} */
let host;
/** @type {(() => void)[]} */
let teardown;

/** @param {object} [options] */
function table(options = {}) {
  const instance = bsTable(host, { columns: COLUMNS, data: ROWS, ...options });
  teardown.push(() => instance.destroy());
  return instance;
}

const headerKeys = () =>
  [...host.querySelectorAll('thead tr:first-child th')].map((th) =>
    th.textContent?.replace(/\s/g, ''),
  );
const bodyText = () =>
  [...host.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent));

/** @param {string} key */
const box = (key) => /** @type {any} */ (host.querySelector(`input[data-egl-column="${key}"]`));

/** @param {Element} target */
function change(target) {
  target.dispatchEvent(new window.Event('change', { bubbles: true }));
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

describe('a hidden column is absent, not merely invisible', () => {
  it('renders nothing for a column declared `visible: false`', () => {
    const instance = table({ columns: [{ key: 'a' }, { key: 'b', visible: false }, { key: 'c' }] });
    expect(headerKeys()).toEqual(['a', 'c']);
    expect(bodyText()).toEqual([
      ['a1', 'c1'],
      ['a2', 'c2'],
    ]);
    expect(instance.getHiddenColumns()).toEqual(['b']);
  });

  it('removes the cells rather than styling them away', () => {
    // `display: none` would leave the cell in the accessibility tree's column
    // count and in every `querySelector` a caller writes — a table that says one
    // thing and shows another.
    const instance = table();
    instance.hideColumn('b');
    expect(host.querySelectorAll('thead th')).toHaveLength(2);
    expect(host.querySelectorAll('tbody tr:first-child td')).toHaveLength(2);
  });

  it('hides and shows through the commands, and reports the set', () => {
    const instance = table();
    expect(instance.getHiddenColumns()).toEqual([]);
    instance.hideColumn('a');
    expect(headerKeys()).toEqual(['b', 'c']);
    instance.toggleColumn('c');
    expect(instance.getHiddenColumns()).toEqual(['a', 'c']);
    instance.toggleColumn('a');
    expect(headerKeys()).toEqual(['a', 'b']);
    instance.showColumn('c');
    expect(headerKeys()).toEqual(['a', 'b', 'c']);
  });

  it('reports the hidden set in declaration order, whatever order it was hidden in', () => {
    const instance = table();
    instance.hideColumn('c');
    instance.hideColumn('a');
    expect(instance.getHiddenColumns()).toEqual(['a', 'c']);
  });

  it('is a no-op when the column is already in the state asked for', () => {
    const instance = table();
    let calls = 0;
    instance.onColumnVisibility(() => (calls += 1));
    instance.showColumn('a');
    expect(calls).toBe(0);
    instance.hideColumn('a');
    expect(calls).toBe(1);
  });

  it('spans the empty-state row across the columns that are left', () => {
    const instance = table({ data: [], empty: 'nothing' });
    expect(host.querySelector('tbody td')?.getAttribute('colspan')).toBe('3');
    instance.hideColumn('b');
    expect(host.querySelector('tbody td')?.getAttribute('colspan')).toBe('2');
  });
});

describe('hiding a column keeps everything else', () => {
  it('does not clear the sort on the column it hides', () => {
    // The point of F128, and true by construction: the derivation never learns
    // about visibility, so there is nothing for a hide to reset.
    const instance = table({ columns: [{ key: 'a', sortable: true }, { key: 'b' }] });
    instance.pipeline.toggleSort('a');
    const before = instance.pipeline.view().sort;
    instance.hideColumn('a');
    expect(instance.pipeline.view().sort).toEqual(before);
    expect(instance.pipeline.view().rows).toHaveLength(2);
  });

  it('keeps filter, search and page across a hide/show cycle', () => {
    const instance = table({
      columns: [{ key: 'a', searchable: true }, { key: 'b' }, { key: 'c' }],
      data: [...ROWS, { a: 'a3', b: 'b3', c: 'c3' }],
      pageSize: 2,
    });
    instance.pipeline.setFilter('b', 'b');
    instance.pipeline.setSearch('a');
    instance.pipeline.setPage(2);
    const before = instance.pipeline.view();
    instance.hideColumn('b');
    instance.showColumn('b');
    const after = instance.pipeline.view();
    expect(after.filters).toEqual(before.filters);
    expect(after.search).toBe(before.search);
    expect(after.page).toBe(before.page);
  });

  it('keeps the width a column was given while it was away', () => {
    const instance = table({ resize: true, columns: [{ key: 'a', width: 90 }, { key: 'b' }] });
    instance.setColumnWidths({ a: 140 });
    instance.hideColumn('a');
    expect(instance.getColumnWidths().a).toBe(140);
    instance.showColumn('a');
    expect(instance.getColumnWidths().a).toBe(140);
  });

  it('keeps the position a column was moved to while it was away', () => {
    const instance = table({ reorder: true });
    instance.setColumnOrder(['c', 'a', 'b']);
    instance.hideColumn('a');
    expect(headerKeys()).toEqual(['c', 'b']);
    expect(instance.getColumnOrder()).toEqual(['c', 'a', 'b']);
    instance.showColumn('a');
    expect(headerKeys()).toEqual(['c', 'a', 'b']);
  });

  it('keeps the head, the colgroup and the filter row in step with the body', () => {
    const instance = table({ resize: true, controls: { filterRow: true } });
    instance.hideColumn('b');
    expect(host.querySelectorAll('colgroup col')).toHaveLength(2);
    expect(host.querySelectorAll('thead tr:last-child td')).toHaveLength(2);
    expect(headerKeys()).toEqual(['a', 'c']);
    instance.showColumn('b');
    expect(host.querySelectorAll('colgroup col')).toHaveLength(3);
    expect(host.querySelectorAll('thead tr:last-child td')).toHaveLength(3);
  });

  it('reflects the selection onto the rows it re-renders', () => {
    const instance = table({ rowKey: 'a', selection: true });
    instance.selection?.select(ROWS[0], 0);
    instance.hideColumn('b');
    const first = /** @type {Element} */ (host.querySelector('tbody tr'));
    expect(first.hasAttribute('data-egl-selected')).toBe(true);
    expect(/** @type {any} */ (first.querySelector('input[data-egl-select]')).checked).toBe(true);
  });

  it('moves a column over the hidden one rather than into its slot', () => {
    const instance = table({ reorder: true });
    instance.hideColumn('b');
    const grip = /** @type {any} */ (host.querySelector('[data-egl-move="a"]'));
    grip.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    // One press, one visible slot: `b` is not a slot a user can see.
    expect(headerKeys()).toEqual(['c', 'a']);
    expect(instance.getColumnOrder()).toEqual(['b', 'c', 'a']);
  });
});

describe('the last visible column is refused', () => {
  it('throws rather than rendering a table with nothing in it', () => {
    const instance = table({ columns: [{ key: 'a' }, { key: 'b' }] });
    instance.hideColumn('a');
    expect(() => instance.hideColumn('b')).toThrow(TypeError);
    expect(() => instance.hideColumn('b')).toThrow(/the last visible column/);
    expect(() => instance.toggleColumn('b')).toThrow(/the last visible column/);
    expect(headerKeys()).toEqual(['b']);
  });

  it('names a column it does not have rather than ignoring it', () => {
    const instance = table();
    expect(() => instance.hideColumn('zz')).toThrow(
      "bsTable: hideColumn() names no such column 'zz'",
    );
    expect(() => instance.showColumn('zz')).toThrow(
      "bsTable: showColumn() names no such column 'zz'",
    );
  });

  it('refuses every command after destroy(), and still answers the query', () => {
    const instance = table();
    instance.destroy();
    expect(() => instance.hideColumn('a')).toThrow(
      'bsTable: hideColumn() was called after destroy()',
    );
    expect(() => instance.showColumn('a')).toThrow(
      'bsTable: showColumn() was called after destroy()',
    );
    expect(() => instance.toggleColumn('a')).toThrow(
      'bsTable: toggleColumn() was called after destroy()',
    );
    expect(() => instance.onColumnVisibility(() => {})).toThrow(
      'bsTable: onColumnVisibility() was called after destroy()',
    );
    expect(instance.getHiddenColumns()).toEqual([]);
  });
});

describe('the subscription', () => {
  it('reports the key and the direction, for the caller and the chooser alike', () => {
    const instance = table();
    /** @type {[string, boolean][]} */
    const seen = [];
    const off = instance.onColumnVisibility((key, visible) => seen.push([key, visible]));
    instance.hideColumn('a');
    instance.showColumn('a');
    off();
    instance.hideColumn('b');
    expect(seen).toEqual([
      ['a', false],
      ['a', true],
    ]);
  });

  it('rejects a listener that is not a function', () => {
    const instance = table();
    expect(() => /** @type {any} */ (instance).onColumnVisibility('nope')).toThrow(TypeError);
  });
});

describe('the chooser (F129)', () => {
  it('is off unless asked for', () => {
    table({ controls: { search: true } });
    expect(host.querySelectorAll('[data-egl-column]')).toHaveLength(0);
  });

  it('renders a named group with one labelled checkbox per column', () => {
    const instance = table({ controls: { columns: true } });
    const group = /** @type {Element} */ (instance.controls?.columns);
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Columns');
    expect([...group.querySelectorAll('input[data-egl-column]')]).toHaveLength(3);
    const first = box('a');
    expect(first.checked).toBe(true);
    const label = group.querySelector(`label[for="${first.getAttribute('id')}"]`);
    // A real `<label for>`, so the visible text *is* the accessible name.
    expect(label?.textContent).toBe('a');
  });

  it('toggles the column the user checked, through the same command a caller calls', () => {
    const instance = table({ controls: { columns: true } });
    box('b').checked = false;
    change(box('b'));
    expect(headerKeys()).toEqual(['a', 'c']);
    expect(instance.getHiddenColumns()).toEqual(['b']);
    box('b').checked = true;
    change(box('b'));
    expect(headerKeys()).toEqual(['a', 'b', 'c']);
  });

  it('follows a caller who hides a column without touching the chooser', () => {
    const instance = table({ controls: { columns: true } });
    instance.hideColumn('c');
    expect(box('c').checked).toBe(false);
  });

  it('disables the last visible box rather than letting a user reach the refusal', () => {
    const instance = table({ columns: [{ key: 'a' }, { key: 'b' }], controls: { columns: true } });
    expect(box('a').disabled).toBe(false);
    instance.hideColumn('a');
    expect(box('b').disabled).toBe(true);
    // The hidden one stays operable: it is the way back.
    expect(box('a').disabled).toBe(false);
    instance.showColumn('a');
    expect(box('b').disabled).toBe(false);
  });

  it('omits a column marked `hideable: false`, and hides it for the caller anyway', () => {
    const instance = table({
      columns: [{ key: 'a', hideable: false }, { key: 'b' }, { key: 'c' }],
      controls: { columns: true },
    });
    expect(box('a')).toBe(null);
    expect(box('b')).not.toBe(null);
    // The exemption is from the user, not from the caller — as `movable: false`
    // still takes a position from `setColumnOrder`.
    instance.hideColumn('a');
    expect(headerKeys()).toEqual(['b', 'c']);
  });

  it('announces the change through an F110 live region', () => {
    table({ controls: { columns: true } });
    const region = /** @type {Element} */ (document.querySelector('[role="status"]'));
    expect(region.getAttribute('aria-live')).toBe('polite');
    box('b').checked = false;
    change(box('b'));
    expect(region.textContent).toBe('b hidden');
    box('b').checked = true;
    change(box('b'));
    expect(region.textContent).toBe('b shown');
  });

  it('takes injected words for every one of its own', () => {
    const instance = table({
      columns: [{ key: 'a', label: 'Host' }, { key: 'b' }],
      controls: {
        columns: {
          label: 'Colonne',
          itemLabel: (/** @type {any} */ column) => `col ${column.key}`,
          announce: (/** @type {any} */ column, /** @type {boolean} */ visible) =>
            `${column.key} ${visible ? 'visibile' : 'nascosta'}`,
          class: 'ms-2',
        },
      },
    });
    const group = /** @type {Element} */ (instance.controls?.columns);
    expect(group.getAttribute('aria-label')).toBe('Colonne');
    expect(group.classList.contains('ms-2')).toBe(true);
    expect(group.querySelector('label')?.textContent).toBe('col a');
    instance.hideColumn('a');
    expect(document.querySelector('[role="status"]')?.textContent).toBe('a nascosta');
  });

  it('rejects a key it does not know, and a malformed one it does', () => {
    expect(() => table({ controls: { columns: { labl: 'x' } } })).toThrow(
      /unknown options\.controls\.columns property 'labl'/,
    );
    expect(() => table({ controls: { columns: { itemLabel: 'x' } } })).toThrow(
      'bsTable: options.controls.columns.itemLabel must be a function',
    );
    expect(() => table({ controls: { columns: { label: '' } } })).toThrow(
      'bsTable: options.controls.columns.label must be a non-empty string',
    );
  });

  it('takes its live region and its listener down with the table', () => {
    const instance = table({ controls: { columns: true } });
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    instance.destroy();
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(0);
  });
});

describe('the F92/F93 round-trip (F129)', () => {
  // The end-to-end claim: a `bsTable` instance already **is** the shape
  // `bindTableHistory` asks for, so putting the columns a user chose into the URL
  // is one option rather than an adapter the caller has to write.
  /** @param {string} search */
  const at = (search) => window.history.replaceState(null, '', `/list${search}`);

  it('restores the hidden set a shared link carries', () => {
    at('?hidden=b');
    const instance = table({ controls: { columns: true } });
    const unbind = bindTableHistory(instance.pipeline, { visibility: instance });
    teardown.push(unbind);
    expect(headerKeys()).toEqual(['a', 'c']);
    expect(box('b').checked).toBe(false);
  });

  it('writes the chooser straight to the address bar', () => {
    at('');
    const instance = table({ controls: { columns: true } });
    teardown.push(bindTableHistory(instance.pipeline, { visibility: instance }));
    box('c').checked = false;
    change(box('c'));
    expect(new URLSearchParams(window.location.search).getAll('hidden')).toEqual(['c']);
    // And the sort the URL also carries is untouched by the hide (F128).
    expect(instance.pipeline.view().sort).toEqual([]);
  });
});
