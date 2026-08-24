// @vitest-environment jsdom
// Tests (roadmap 19.3, spec 06 §2 item F95, §6) for bsTable's checkbox column:
// the tri-state header, the page-and-only-this-page rule, reflection without a
// re-render, and a teardown that respects what it borrowed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bsTable } from '../../../../../main/javascript/it/d4np/utils/bootstrap.js';
import { tableSelection } from '../../../../../main/javascript/it/d4np/utils/table.js';

const ROWS = Array.from({ length: 7 }, (_unused, index) => ({
  id: index + 1,
  name: `n${index + 1}`,
  status: index % 2 === 0 ? 'active' : 'archived',
}));

const COLUMNS = [{ key: 'id' }, { key: 'name' }, { key: 'status' }];

/** @type {Element} */
let host;
/** @type {(() => void)[]} */
let teardown;

/** @param {object} [options] */
function table(options = {}) {
  const instance = bsTable(host, { columns: COLUMNS, data: ROWS, rowKey: 'id', ...options });
  teardown.push(() => instance.destroy());
  return instance;
}

/** Every row control currently in the body, in document order. */
const boxes = () => [...host.querySelectorAll('tbody input[data-egl-select]')];
const headerBox = () => host.querySelector('thead input[type="checkbox"]');
const selectedRows = () => [...host.querySelectorAll('tbody tr[data-egl-selected]')];

/** @param {Element} el */
function click(el) {
  /** @type {any} */ (el).checked = !(/** @type {any} */ (el).checked);
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = /** @type {Element} */ (document.getElementById('host'));
  teardown = [];
});

afterEach(() => {
  for (const fn of teardown) fn();
  vi.restoreAllMocks();
});

describe('off by default', () => {
  it('renders no selection column and exposes no selection', () => {
    const instance = table();
    expect(boxes()).toHaveLength(0);
    expect(headerBox()).toBe(null);
    expect(instance.selection).toBeUndefined();
    expect(host.querySelectorAll('thead th')).toHaveLength(3);
  });
});

describe('the column', () => {
  it('renders one checkbox per row plus a header control', () => {
    table({ selection: true });
    expect(boxes()).toHaveLength(ROWS.length);
    expect(headerBox()).not.toBe(null);
    expect(host.querySelectorAll('thead th')).toHaveLength(4);
    expect(host.querySelectorAll('tbody tr:first-child td')).toHaveLength(4);
  });

  it('names each control after the row, never "checkbox" (F95)', () => {
    table({ selection: true });
    expect(boxes()[0].getAttribute('aria-label')).toBe('1');
    expect(headerBox().getAttribute('aria-label')).toBe('Select all');
  });

  it('takes a caller phrase for the name', () => {
    table({
      selection: { labels: { select: (row) => `Seleziona ${row.name}`, selectAll: 'Tutti' } },
    });
    expect(boxes()[0].getAttribute('aria-label')).toBe('Seleziona n1');
    expect(headerBox().getAttribute('aria-label')).toBe('Tutti');
  });

  it('renders radios and no bulk control in single mode', () => {
    table({ selection: { mode: 'single' } });
    const controls = boxes();
    expect(controls).toHaveLength(ROWS.length);
    expect(controls[0].getAttribute('type')).toBe('radio');
    expect(headerBox()).toBe(null);
    // The header cell is still named — an unlabelled one is announced as nothing.
    expect(host.querySelector('thead th').getAttribute('aria-label')).toBe('Select');
  });

  it('gives two tables on one page distinct radio groups', () => {
    const second = document.createElement('div');
    document.body.append(second);
    table({ selection: { mode: 'single' } });
    const other = bsTable(second, {
      columns: COLUMNS,
      data: ROWS,
      rowKey: 'id',
      selection: { mode: 'single' },
    });
    teardown.push(() => other.destroy());

    const a = host.querySelector('tbody input').getAttribute('name');
    const b = second.querySelector('tbody input').getAttribute('name');
    expect(a).not.toBe(b);
  });

  it('drops the bulk control when asked, keeping per-row selection', () => {
    table({ selection: { selectAll: false } });
    expect(headerBox()).toBe(null);
    expect(boxes()).toHaveLength(ROWS.length);
  });

  it('counts the selection column in the empty-state colspan', () => {
    const instance = table({ selection: true, empty: 'nothing here' });
    instance.pipeline.setFilter('name', 'zzz');
    expect(host.querySelector('tbody td').getAttribute('colspan')).toBe('4');
  });
});

describe('selecting', () => {
  it('ticks a row into the selection', () => {
    const instance = table({ selection: true });
    click(boxes()[2]);
    expect(instance.selection.getSelection()).toEqual(['3']);
  });

  it('unticks it back out', () => {
    const instance = table({ selection: { initial: [3] } });
    expect(/** @type {any} */ (boxes()[2]).checked).toBe(true);
    click(boxes()[2]);
    expect(instance.selection.count()).toBe(0);
  });

  it('marks the row for CSS without the caller re-rendering', () => {
    const instance = table({ selection: true });
    const renders = vi.fn();
    instance.pipeline.on('change', renders);

    click(boxes()[1]);

    const marked = selectedRows();
    expect(marked).toHaveLength(1);
    expect(marked[0].classList.contains('table-active')).toBe(true);
    // The pipeline never moved: reflection is attributes, not a re-render (F95).
    expect(renders).not.toHaveBeenCalled();
  });

  it('reflects a change made through the model, not the DOM', () => {
    const instance = table({ selection: true });
    instance.selection.select(ROWS[4], 4);
    expect(/** @type {any} */ (boxes()[4]).checked).toBe(true);
    expect(selectedRows()).toHaveLength(1);
  });

  it('replaces in single mode, in the markup as well as the model', () => {
    const instance = table({ selection: { mode: 'single' } });
    click(boxes()[0]);
    click(boxes()[3]);
    expect(instance.selection.getSelection()).toEqual(['4']);
    expect(/** @type {any} */ (boxes()[0]).checked).toBe(false);
    expect(selectedRows()).toHaveLength(1);
  });
});

describe('the header control', () => {
  it('goes indeterminate when the page is partly selected (F95)', () => {
    table({ selection: true });
    click(boxes()[0]);
    const head = /** @type {any} */ (headerBox());
    // `indeterminate` is a property with no HTML attribute, which is exactly why
    // the requirement names it: an empty box over a partly-selected page says
    // "nothing is selected" and the next click ticks rows the user thought safe.
    expect(head.indeterminate).toBe(true);
    expect(head.checked).toBe(false);
  });

  it('is checked and determinate once the page is full', () => {
    const instance = table({ selection: true });
    instance.selection.selectAll(ROWS);
    const head = /** @type {any} */ (headerBox());
    expect(head.checked).toBe(true);
    expect(head.indeterminate).toBe(false);
  });

  it('selects this page and only this page (F94)', () => {
    const instance = table({ selection: true, pageSize: 3 });
    click(headerBox());

    expect(instance.selection.getSelection()).toEqual(['1', '2', '3']);
    expect(instance.selection.stats(instance.pipeline.view().rows).offPage).toBe(0);
  });

  it('never touches rows a filter is hiding', () => {
    const instance = table({ selection: true });
    instance.pipeline.setFilter('status', 'active'); // ids 1, 3, 5, 7
    click(headerBox());

    expect(instance.selection.getSelection()).toEqual(['1', '3', '5', '7']);
  });

  it('deselects only this page, leaving the rest of the selection alone', () => {
    const instance = table({ selection: true, pageSize: 3 });
    instance.selection.selectAll(ROWS); // all seven, across three pages

    const head = /** @type {any} */ (headerBox());
    expect(head.checked).toBe(true);
    click(head);

    // Page one is gone from the selection; the four rows elsewhere survive.
    expect(instance.selection.getSelection()).toEqual(['4', '5', '6', '7']);
    expect(instance.selection.stats(instance.pipeline.view().rows)).toMatchObject({
      onPage: 0,
      offPage: 4,
    });
  });

  it('re-reads the page after paging, and the rows keep their state', () => {
    const instance = table({ selection: true, pageSize: 3 });
    click(headerBox()); // page 1 selected

    instance.pipeline.setPage(2);
    expect(/** @type {any} */ (headerBox()).checked).toBe(false);
    expect(selectedRows()).toHaveLength(0);

    instance.pipeline.setPage(1);
    expect(/** @type {any} */ (headerBox()).checked).toBe(true);
    expect(selectedRows()).toHaveLength(3);
  });
});

describe('composition', () => {
  it('does not fire onRowClick when a control inside the row is clicked', () => {
    const onRowClick = vi.fn();
    table({ selection: true, onRowClick });

    boxes()[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders a selection the caller already owns, and leaves it alive', () => {
    const shared = tableSelection({ rowKey: 'id', initial: [2] });
    const instance = table({ selection: { selection: shared } });

    expect(instance.selection).toBe(shared);
    expect(/** @type {any} */ (boxes()[1]).checked).toBe(true);

    instance.destroy();
    // Borrowed, not owned — the same rule an injected pipeline gets.
    expect(() => shared.select(ROWS[0])).not.toThrow();
    expect(shared.getSelection()).toEqual(['2', '1']);
  });

  it('destroys a selection it created', () => {
    const instance = table({ selection: true });
    const owned = instance.selection;
    instance.destroy();
    expect(() => owned.select(ROWS[0])).toThrow(/after destroy/);
  });

  it('stops reflecting after destroy', () => {
    const shared = tableSelection({ rowKey: 'id' });
    const instance = table({ selection: { selection: shared } });
    instance.destroy();
    // No listener, no throw, no orphaned markup to update.
    expect(() => shared.selectAll(ROWS)).not.toThrow();
  });
});

describe('events that are not ours', () => {
  // The same guards row activation carries, for the same reason: our marker in
  // somebody else's markup must not resolve against our rows.
  it('ignores a change from a control without the marker', () => {
    const instance = table({ selection: true });
    const stray = document.createElement('input');
    stray.setAttribute('type', 'checkbox');
    host.querySelector('tbody tr').append(stray);

    click(stray);

    expect(instance.selection.count()).toBe(0);
  });

  it('ignores a marked control inside a table nested in one of our cells', () => {
    const instance = table({ selection: true });
    const nested = document.createElement('table');
    nested.innerHTML =
      '<tbody><tr data-egl-index="0"><td><input type="checkbox" data-egl-select /></td></tr></tbody>';
    host.querySelector('tbody tr td').append(nested);

    click(nested.querySelector('input'));

    // The nested row carries index 0 and would have selected OUR first row.
    expect(instance.selection.count()).toBe(0);
  });

  it('ignores a row whose index names no row of ours', () => {
    const instance = table({ selection: true });
    const foreign = document.createElement('tr');
    foreign.setAttribute('data-egl-index', '99');
    foreign.innerHTML = '<td><input type="checkbox" data-egl-select /></td>';
    host.querySelector('tbody').append(foreign);

    click(foreign.querySelector('input'));

    expect(instance.selection.count()).toBe(0);
  });

  it('reflects onto a foreign row that has no control of ours', () => {
    // Someone appended a row into our tbody carrying our index marker but no
    // checkbox. Reflection still marks it, and does not reach for a control that
    // is not there.
    const instance = table({ selection: true });
    const foreign = document.createElement('tr');
    foreign.setAttribute('data-egl-index', '0');
    foreign.innerHTML = '<td>added by someone else</td>';
    host.querySelector('tbody').append(foreign);

    expect(() => instance.selection.select(ROWS[0])).not.toThrow();
    expect(foreign.classList.contains('table-active')).toBe(true);
  });

  it('ignores a change with no element target at all', () => {
    const instance = table({ selection: true });
    host.querySelector('tbody').dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(instance.selection.count()).toBe(0);
  });
});

describe('contract', () => {
  it('refuses selection without a rowKey', () => {
    expect(() => bsTable(host, { columns: COLUMNS, data: ROWS, selection: true })).toThrow(
      /options.selection requires options.rowKey/,
    );
  });

  it('rejects an unknown selection option and a malformed one', () => {
    const base = { columns: COLUMNS, data: ROWS, rowKey: 'id' };
    expect(() => bsTable(host, { ...base, selection: { selectAllRows: true } })).toThrow(
      /unknown option 'selectAllRows'/,
    );
    expect(() => bsTable(host, { ...base, selection: { selectAll: 'yes' } })).toThrow(
      /options.selection.selectAll must be a boolean/,
    );
    expect(() => bsTable(host, { ...base, selection: { mode: 'many' } })).toThrow(
      /options.mode must be 'single' or 'multiple'/,
    );
    expect(() => bsTable(host, { ...base, selection: 'yes' })).toThrow(
      /options.selection must be an object/,
    );
  });

  it('refuses both an existing selection and an initial set', () => {
    const base = { columns: COLUMNS, data: ROWS, rowKey: 'id' };
    const shared = tableSelection({ rowKey: 'id' });
    expect(() =>
      bsTable(host, { ...base, selection: { selection: shared, initial: [1] } }),
    ).toThrow(/not both/);
  });

  it('refuses an object that is not a selection', () => {
    const base = { columns: COLUMNS, data: ROWS, rowKey: 'id' };
    expect(() => bsTable(host, { ...base, selection: { selection: { keyOf: 1 } } })).toThrow(
      /must be a tableSelection — keyOf\(\) is missing/,
    );
  });

  it('takes selection: false as off', () => {
    const instance = table({ selection: false });
    expect(instance.selection).toBeUndefined();
    expect(boxes()).toHaveLength(0);
  });
});

describe('the filter row lines up with the columns it filters (BUG-0005)', () => {
  /** Cell counts for every row that mirrors the columns, in document order. */
  const rowWidths = () =>
    [...host.querySelectorAll('thead tr, tbody tr')].map((tr) => tr.children.length);

  it('prepends a cell for the selection column, so every row is the same width', () => {
    table({ selection: true, controls: { filterRow: true } });
    // Before the fix the filter row was one cell short: its first input sat under
    // the checkboxes and every filter after it under its left-hand neighbour,
    // with the last column appearing to have none at all.
    const widths = rowWidths();
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(COLUMNS.length + 1);
  });

  it('puts each filter under the column it filters', () => {
    table({ selection: true, controls: { filterRow: true } });
    const filterRow = /** @type {Element} */ (host.querySelector('thead tr:last-child'));
    const headerRow = /** @type {Element} */ (host.querySelector('thead tr:first-child'));
    const labels = [...filterRow.children].map(
      (cell) => cell.querySelector('input')?.getAttribute('aria-label') ?? null,
    );
    // Column n's filter is in cell n. The first cell is the spacer under the
    // checkbox column and holds no control.
    expect(labels).toEqual([null, 'Filter id', 'Filter name', 'Filter status']);
    expect(headerRow.children[0].querySelector('input[type="checkbox"]')).not.toBe(null);
  });

  it('gives the spacer the selection column class, so it lines up without a colgroup', () => {
    table({ selection: { class: 'w-1' }, controls: { filterRow: true } });
    const [spacer] = /** @type {Element} */ (host.querySelector('thead tr:last-child')).children;
    // The same class the header and body selection cells carry — usually a width,
    // which is the only thing keeping a checkbox column narrow when F99 is off.
    expect(spacer.className).toBe('w-1');
    expect(spacer.tagName).toBe('TD');
    // A `<td>`, not a `<th>`: the cells beside it are `<td>` because they are
    // controls rather than headers, and an empty cell does not change that.
    expect(spacer.children).toHaveLength(0);
  });

  it('adds nothing when there is no selection column', () => {
    table({ controls: { filterRow: true } });
    const widths = rowWidths();
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(COLUMNS.length);
  });

  it('leaves the empty-state row spanning every column', () => {
    table({ selection: true, controls: { filterRow: true }, data: [], empty: 'None' });
    const cells = [...(host.querySelector('tbody tr')?.children ?? [])];
    expect(cells).toHaveLength(1);
    expect(cells[0].getAttribute('colspan')).toBe(String(COLUMNS.length + 1));
  });
});
