// @vitest-environment jsdom
// Example tests (roadmap 13.2, spec 03 §2 item F51, NFR-15, ADR-0035) for the
// bridge between a table pipeline and its DOM controls: commands flow one way,
// state reflects back, and teardown leaves nothing behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindTableControls } from '../../../../../main/javascript/it/d4np/utils/dom.js';
import { tablePipeline } from '../../../../../main/javascript/it/d4np/utils/table.js';

const ROWS = [
  { id: 3, name: 'Charlie', status: 'active' },
  { id: 1, name: 'ada', status: 'archived' },
  { id: 4, name: 'Dora', status: 'active' },
  { id: 2, name: 'Bob', status: 'pending' },
];

/** @type {ReturnType<typeof tablePipeline>} */
let table;

const BINDINGS = {
  filters: { name: '#f-name' },
  search: '#q',
  sortHeaders: { root: 'thead', selector: 'th[data-sort-key]' },
  pagination: { prev: '#prev', next: '#next', status: '#page' },
  pageSize: '#page-size',
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <input id="f-name" />
    <input id="q" />
    <select id="page-size"><option value="2">2</option><option value="">All</option></select>
    <table>
      <thead>
        <tr>
          <th data-sort-key="name">Name</th>
          <th data-sort-key="status">Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
    <button id="prev">Prev</button>
    <button id="next">Next</button>
    <span id="page"></span>
  `;
  table = tablePipeline({ source: ROWS, pageSize: 2 });
});

afterEach(() => {
  vi.useRealTimers();
});

/** @param {string} selector @returns {any} */
const $ = (selector) => document.querySelector(selector);

/** @param {string} selector @param {string} value */
function type(selector, value) {
  const el = $(selector);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** @param {string} selector */
function click(selector) {
  $(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('bindTableControls — inputs drive the pipeline', () => {
  it('debounces a filter input into setFilter', () => {
    const unbind = bindTableControls(table, BINDINGS);
    type('#f-name', 'ad');
    type('#f-name', 'ada');

    expect(table.view().filters).toEqual({}); // nothing yet — still quiet
    vi.advanceTimersByTime(200);

    expect(table.view().filters).toEqual({ name: 'ada' });
    expect(table.view().rows.map((row) => row.name)).toEqual(['ada']);
    unbind();
  });

  it('debounces the search input into setSearch', () => {
    bindTableControls(table, BINDINGS);
    type('#q', 'active');
    vi.advanceTimersByTime(200);
    expect(table.view().search).toBe('active');
    expect(table.view().totalFiltered).toBe(2);
  });

  it('honours a custom debounce window, and binds undebounced at 0', () => {
    bindTableControls(table, BINDINGS, { debounceMs: 50 });
    type('#q', 'active');
    vi.advanceTimersByTime(50);
    expect(table.view().search).toBe('active');

    const second = tablePipeline({ source: ROWS });
    bindTableControls(second, { search: '#q' }, { debounceMs: 0 });
    type('#q', 'dora');
    expect(second.view().search).toBe('dora'); // no timer advanced
  });

  it('sets the page size, and stops paginating on a blank value', () => {
    bindTableControls(table, BINDINGS);
    const select = $('#page-size');

    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(table.view().pageCount).toBe(2);

    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(table.view().pageCount).toBe(1);
    expect(table.view().rows).toHaveLength(4);
  });

  it('pages with the previous and next controls', () => {
    bindTableControls(table, BINDINGS);
    click('#next');
    expect(table.view().page).toBe(2);
    click('#prev');
    expect(table.view().page).toBe(1);
  });
});

describe('bindTableControls — sort headers', () => {
  it('cycles a column from one delegated listener', () => {
    bindTableControls(table, BINDINGS);
    const header = $('th[data-sort-key="name"]');

    click('th[data-sort-key="name"]');
    expect(table.view().sort).toEqual([{ key: 'name', direction: 'asc' }]);
    click('th[data-sort-key="name"]');
    expect(table.view().sort).toEqual([{ key: 'name', direction: 'desc' }]);
    click('th[data-sort-key="name"]');
    expect(table.view().sort).toEqual([]);
    expect(header.getAttribute('aria-sort')).toBe('none');
  });

  it('attaches exactly one listener for every header', () => {
    const thead = $('thead');
    const spy = vi.spyOn(thead, 'addEventListener');
    bindTableControls(table, { sortHeaders: { root: thead, selector: 'th[data-sort-key]' } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('ignores a header that declares no key', () => {
    // A selector that matches every header, sortable or not, is a legitimate
    // way to write this: the data-sort-key attribute is what marks a column
    // sortable, so a header without one is simply skipped.
    bindTableControls(table, { sortHeaders: { root: 'thead', selector: 'th' } });

    $('thead th:last-child').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(table.view().sort).toEqual([]);
    expect($('thead th:last-child').getAttribute('aria-sort')).toBe('none');

    click('th[data-sort-key="name"]');
    expect(table.view().sort).toEqual([{ key: 'name', direction: 'asc' }]);
  });

  it('keeps working after the caller re-renders the header row', () => {
    bindTableControls(table, BINDINGS);
    // The caller owns rendering; a stale node list would silently stop
    // receiving aria-sort, and a per-header listener would be gone entirely.
    $('thead').innerHTML = '<tr><th data-sort-key="status">Status</th></tr>';
    click('th[data-sort-key="status"]');

    expect(table.view().sort).toEqual([{ key: 'status', direction: 'asc' }]);
    expect($('th[data-sort-key="status"]').getAttribute('aria-sort')).toBe('ascending');
  });
});

describe('bindTableControls — state reflects back', () => {
  it('writes aria-sort on every header, on every change', () => {
    bindTableControls(table, BINDINGS);
    const name = $('th[data-sort-key="name"]');
    const status = $('th[data-sort-key="status"]');

    expect(name.getAttribute('aria-sort')).toBe('none'); // reflected at bind time

    table.toggleSort('name');
    expect(name.getAttribute('aria-sort')).toBe('ascending');
    expect(status.getAttribute('aria-sort')).toBe('none');

    table.toggleSort('name');
    expect(name.getAttribute('aria-sort')).toBe('descending');

    table.setSort([
      { key: 'status', direction: 'asc' },
      { key: 'name', direction: 'desc' },
    ]);
    expect(status.getAttribute('aria-sort')).toBe('ascending');
    expect(name.getAttribute('aria-sort')).toBe('descending');
  });

  it('enables and disables the pagination controls from the derived view', () => {
    bindTableControls(table, BINDINGS);
    expect($('#prev').disabled).toBe(true); // page 1 of 2
    expect($('#next').disabled).toBe(false);

    table.setPage(2);
    expect($('#prev').disabled).toBe(false);
    expect($('#next').disabled).toBe(true);

    table.setFilter('status', 'nothing-matches');
    expect($('#prev').disabled).toBe(true);
    expect($('#next').disabled).toBe(true);
  });

  it('shows a language-neutral position by default', () => {
    bindTableControls(table, BINDINGS);
    expect($('#page').textContent).toBe('1 / 2');
    table.setPage(2);
    expect($('#page').textContent).toBe('2 / 2');
  });

  it('takes an injected status formatter', () => {
    bindTableControls(table, BINDINGS, {
      formatStatus: (view) => `Pagina ${view.page} di ${view.pageCount}`,
    });
    expect($('#page').textContent).toBe('Pagina 1 di 2');
  });

  it('leaves the filter inputs alone — reflection is one-way', () => {
    bindTableControls(table, BINDINGS);
    $('#f-name').value = 'typed by the user';
    table.setFilter('name', 'set in code');
    expect($('#f-name').value).toBe('typed by the user');
  });
});

describe('bindTableControls — teardown (NFR-15)', () => {
  it('stops driving the pipeline after unbind', () => {
    const unbind = bindTableControls(table, BINDINGS);
    unbind();

    type('#f-name', 'ada');
    vi.advanceTimersByTime(200);
    click('#next');
    click('th[data-sort-key="name"]');

    expect(table.view().filters).toEqual({});
    expect(table.view().page).toBe(1);
    expect(table.view().sort).toEqual([]);
  });

  it('cancels a debounce already in flight, so nothing trails the teardown', () => {
    const unbind = bindTableControls(table, BINDINGS);
    type('#f-name', 'ada'); // queued, not yet applied
    unbind();
    vi.advanceTimersByTime(1000);
    expect(table.view().filters).toEqual({});
  });

  it('stops reflecting after unbind', () => {
    const unbind = bindTableControls(table, BINDINGS);
    unbind();
    table.setPage(2);
    expect($('#page').textContent).toBe('1 / 2'); // frozen at the last reflected state
  });

  it('unbinding twice is a no-op', () => {
    const unbind = bindTableControls(table, BINDINGS);
    unbind();
    expect(() => unbind()).not.toThrow();
  });

  it('tears down when the caller aborts its signal', () => {
    const controller = new AbortController();
    bindTableControls(table, BINDINGS, { signal: controller.signal });
    controller.abort();

    type('#q', 'active');
    vi.advanceTimersByTime(200);
    expect(table.view().search).toBe('');
  });

  it('binds nothing when handed an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    bindTableControls(table, BINDINGS, { signal: controller.signal });

    click('#next');
    expect(table.view().page).toBe(1);
  });
});

describe('bindTableControls — contract failures', () => {
  it('names every selector that matched nothing, in one throw', () => {
    expect(() =>
      bindTableControls(table, {
        filters: { name: '#missing-filter' },
        search: '#missing-search',
      }),
    ).toThrow(/missing-filter[\s\S]*missing-search/);

    try {
      bindTableControls(table, { search: '#nope' });
    } catch (error) {
      expect(error.code).toBe('EGL_DOM_CONTRACT'); // by code, never instanceof
    }
  });

  it('accepts elements as well as selectors', () => {
    const unbind = bindTableControls(table, {
      search: $('#q'),
      pagination: { next: $('#next') },
    });
    click('#next');
    expect(table.view().page).toBe(2);
    unbind();
  });

  it('resolves selectors against an explicit root', () => {
    const scope = document.createElement('div');
    scope.innerHTML = '<input class="q" />';
    // The same selector resolves inside the root and nowhere else.
    const unbind = bindTableControls(table, { search: '.q' }, { root: scope, debounceMs: 0 });
    const input = scope.querySelector('.q');
    input.value = 'dora';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(table.view().search).toBe('dora');
    unbind();
  });

  it('rejects a pipeline missing the command a binding needs', () => {
    const partial = { on: () => () => {}, view: () => ({ sort: [], page: 1, pageCount: 1 }) };
    expect(() => bindTableControls(partial, { search: '#q' })).toThrow(/setSearch/);
    expect(() => bindTableControls({}, {})).toThrow(TypeError);
    expect(() => bindTableControls(null, {})).toThrow(TypeError);
  });

  it('rejects malformed bindings and options', () => {
    expect(() => bindTableControls(table, null)).toThrow(TypeError);
    expect(() => bindTableControls(table, { search: '#q' }, null)).not.toThrow(); // null reads as no options

    expect(() => bindTableControls(table, BINDINGS, { debounceMs: -1 })).toThrow(TypeError);
    expect(() => bindTableControls(table, BINDINGS, { debounceMs: 'fast' })).toThrow(TypeError);
    expect(() => bindTableControls(table, BINDINGS, { formatStatus: 'page' })).toThrow(TypeError);
    expect(() => bindTableControls(table, BINDINGS, { signal: 'later' })).toThrow(TypeError);
    expect(() => bindTableControls(table, { search: 42 })).toThrow(TypeError);
  });
});
