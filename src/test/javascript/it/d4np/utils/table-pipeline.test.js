// @vitest-environment node
// Tests (roadmap 13.1, spec 03 §2 F42, ADR-0034) for tablePipeline: the commands,
// the memoized read model, the single-'change' transaction rule, and the
// composition of filtering with sorting that the split widgets could not do.
//
// The environment is pinned rather than inherited: NFR-14 makes "derives with no
// DOM anywhere" half of this module's contract, and a future switch of the
// project default must not quietly turn this suite into a jsdom run that proves
// the opposite of what it claims.
import { describe, it, expect, vi } from 'vitest';
import { tablePipeline } from '../../../../../main/javascript/it/d4np/utils/table.js';

/** A small, deliberately unsorted fixture with one empty and one nullish cell. */
const ROWS = [
  { id: 3, name: 'Charlie', role: 'admin', seen: '2026-03-02', score: 10 },
  { id: 1, name: 'ada', role: 'user', seen: '2026-01-05', score: 30 },
  { id: 4, name: 'Dora', role: 'admin', seen: '2026-02-11', score: null },
  { id: 2, name: 'Bob', role: '', seen: '2026-04-20', score: 20 },
];

/** @param {object} [options] */
const make = (options = {}) => tablePipeline({ source: ROWS, ...options });

describe('tablePipeline — construction', () => {
  it('starts with every row, unfiltered and unsorted', () => {
    const view = make().view();
    expect(view.rows).toHaveLength(4);
    expect(view.total).toBe(4);
    expect(view.totalFiltered).toBe(4);
    expect(view.page).toBe(1);
    expect(view.pageCount).toBe(1);
    expect(view.sort).toEqual([]);
    expect(view.filters).toEqual({});
    expect(view.search).toBe('');
  });

  it('defaults to no source at all', () => {
    expect(tablePipeline().view().rows).toEqual([]);
    expect(tablePipeline({}).view().total).toBe(0);
    // `null` reads as "no options", matching paginate() on this same entry.
    expect(tablePipeline(null).view().total).toBe(0);
  });

  it('copies the source, so later mutation of the caller array is ignored', () => {
    const source = [{ id: 1 }];
    const table = tablePipeline({ source });
    source.push({ id: 2 });
    expect(table.view().rows).toHaveLength(1);
  });

  it('never mutates the source array', () => {
    const source = ROWS.slice();
    const table = tablePipeline({ source });
    table.setSort([{ key: 'name', direction: 'desc' }]);
    table.view();
    expect(source).toEqual(ROWS);
  });

  it('rejects a non-array source', () => {
    expect(() => tablePipeline({ source: 'rows' })).toThrow(TypeError);
  });

  it('rejects malformed columns', () => {
    expect(() => tablePipeline({ columns: 'name' })).toThrow(TypeError);
    expect(() => tablePipeline({ columns: [null] })).toThrow(TypeError);
    expect(() => tablePipeline({ columns: [{}] })).toThrow(TypeError);
    expect(() => tablePipeline({ columns: [{ key: 'a', type: 'colour' }] })).toThrow(TypeError);
    expect(() => tablePipeline({ columns: [{ key: 'a', compare: 'asc' }] })).toThrow(TypeError);
    expect(() => tablePipeline({ columns: [{ key: 'a', getValue: 'a' }] })).toThrow(TypeError);
  });

  it('rejects a non-positive page size', () => {
    expect(() => tablePipeline({ pageSize: 0 })).toThrow(TypeError);
    expect(() => tablePipeline({ pageSize: 2.5 })).toThrow(TypeError);
  });
});

describe('tablePipeline — filtering', () => {
  it('applies the F33 grammar per column', () => {
    const table = make();
    table.setFilter('name', '^a');
    expect(table.view().rows.map((row) => row.name)).toEqual(['ada']);
  });

  it('ANDs several column filters', () => {
    const table = make();
    table.setFilter('role', 'admin');
    table.setFilter('name', '^d');
    expect(table.view().rows.map((row) => row.name)).toEqual(['Dora']);
  });

  it('accepts a predicate as well as an expression', () => {
    const table = make();
    table.setFilter('score', (value) => typeof value === 'number' && value >= 20);
    expect(table.view().rows.map((row) => row.id)).toEqual([1, 2]);
  });

  it('clears a filter with null or an empty string', () => {
    const table = make();
    table.setFilter('role', 'admin');
    expect(table.view().totalFiltered).toBe(2);
    table.setFilter('role', null);
    expect(table.view().totalFiltered).toBe(4);
    table.setFilter('role', 'admin');
    table.setFilter('role', '');
    expect(table.view().filters).toEqual({});
  });

  it('reports the active filters as given', () => {
    const predicate = () => true;
    const table = make();
    table.setFilter('name', '^a');
    table.setFilter('score', predicate);
    expect(table.view().filters).toEqual({ name: '^a', score: predicate });
  });

  it('reads through a column getValue', () => {
    const table = tablePipeline({
      source: ROWS,
      columns: [{ key: 'initial', getValue: (row) => row.name.slice(0, 1).toUpperCase() }],
    });
    table.setFilter('initial', 'D');
    expect(table.view().rows.map((row) => row.name)).toEqual(['Dora']);
  });

  it('rejects an undeclared key, an unfilterable column, and a bad filter', () => {
    const table = tablePipeline({
      source: ROWS,
      columns: [{ key: 'name' }, { key: 'seen', filterable: false }],
    });
    expect(() => table.setFilter('nope', 'x')).toThrow(TypeError);
    expect(() => table.setFilter('seen', 'x')).toThrow(TypeError);
    expect(() => table.setFilter('name', 42)).toThrow(TypeError);
    expect(() => table.setFilter(42, 'x')).toThrow(TypeError);
  });

  it('accepts any key when no columns are declared', () => {
    const table = make();
    expect(() => table.setFilter('whatever', 'x')).not.toThrow();
  });
});

describe('tablePipeline — search', () => {
  it('ORs across every own key when no columns are declared', () => {
    const table = make();
    table.setSearch('admin');
    expect(table.view().rows.map((row) => row.id)).toEqual([3, 4]);
  });

  it('reads only the columns marked searchable', () => {
    const table = tablePipeline({
      source: ROWS,
      columns: [{ key: 'name', searchable: true }, { key: 'role' }],
    });
    table.setSearch('admin');
    expect(table.view().totalFiltered).toBe(0);
  });

  it('searches every declared column when none is marked', () => {
    const table = tablePipeline({
      source: ROWS,
      columns: [{ key: 'name' }, { key: 'role' }],
    });
    table.setSearch('admin');
    expect(table.view().totalFiltered).toBe(2);
  });

  it('clears with an empty string', () => {
    const table = make();
    table.setSearch('admin');
    table.setSearch('');
    expect(table.view().totalFiltered).toBe(4);
    expect(table.view().search).toBe('');
  });

  it('survives a hole in the source rather than failing the whole search', () => {
    const table = tablePipeline({ source: [{ name: 'ada' }, null, undefined] });
    table.setSearch('ada');
    expect(table.view().totalFiltered).toBe(1);
  });

  it('rejects a non-string', () => {
    expect(() => make().setSearch(null)).toThrow(TypeError);
  });
});

describe('tablePipeline — sorting', () => {
  it('cycles a column through asc, desc, unsorted', () => {
    const table = make();
    table.toggleSort('name');
    expect(table.view().sort).toEqual([{ key: 'name', direction: 'asc' }]);
    expect(table.view().rows.map((row) => row.name)).toEqual(['ada', 'Bob', 'Charlie', 'Dora']);

    table.toggleSort('name');
    expect(table.view().sort).toEqual([{ key: 'name', direction: 'desc' }]);
    expect(table.view().rows.map((row) => row.name)).toEqual(['Dora', 'Charlie', 'Bob', 'ada']);

    table.toggleSort('name');
    expect(table.view().sort).toEqual([]);
    expect(table.view().rows.map((row) => row.id)).toEqual([3, 1, 4, 2]);
  });

  it('starts a fresh ascending sort when another column is toggled', () => {
    const table = make();
    table.toggleSort('name');
    table.toggleSort('name');
    table.toggleSort('id');
    expect(table.view().sort).toEqual([{ key: 'id', direction: 'asc' }]);
  });

  it('orders by several keys, most significant first', () => {
    const table = make();
    table.setSort([
      { key: 'role', direction: 'asc' },
      { key: 'name', direction: 'desc' },
    ]);
    expect(table.view().rows.map((row) => row.name)).toEqual(['Dora', 'Charlie', 'ada', 'Bob']);
  });

  it('uses a column comparator, and honours direction for it', () => {
    const byLength = (a, b) => String(a).length - String(b).length;
    const table = tablePipeline({ source: ROWS, columns: [{ key: 'name', compare: byLength }] });
    table.setSort([{ key: 'name', direction: 'asc' }]);
    expect(table.view().rows.map((row) => row.name)).toEqual(['ada', 'Bob', 'Dora', 'Charlie']);
    table.setSort([{ key: 'name', direction: 'desc' }]);
    // Descending negates the comparison, it does not reverse the list: the
    // 3-letter tie keeps its source order in both directions, which is what
    // makes a multi-key sort stable.
    expect(table.view().rows.map((row) => row.name)).toEqual(['Charlie', 'Dora', 'ada', 'Bob']);
  });

  it('passes both rows to a column comparator', () => {
    const compare = vi.fn(() => 0);
    const table = tablePipeline({ source: ROWS, columns: [{ key: 'name', compare }] });
    table.setSort([{ key: 'name', direction: 'asc' }]);
    table.view();
    const [value, , row] = compare.mock.calls[0];
    expect(typeof value).toBe('string');
    expect(row).toHaveProperty('id');
  });

  it('sorts by declared type', () => {
    const table = tablePipeline({ source: ROWS, columns: [{ key: 'seen', type: 'date' }] });
    table.setSort([{ key: 'seen', direction: 'asc' }]);
    expect(table.view().rows.map((row) => row.id)).toEqual([1, 4, 3, 2]);
  });

  it('rejects malformed sort entries', () => {
    const table = make();
    expect(() => table.setSort('name')).toThrow(TypeError);
    expect(() => table.setSort([null])).toThrow(TypeError);
    expect(() => table.setSort([{ key: 'name' }])).toThrow(TypeError);
    expect(() => table.setSort([{ key: 'name', direction: 'up' }])).toThrow(TypeError);
    expect(() => table.toggleSort(7)).toThrow(TypeError);
  });

  it('clears with an empty array', () => {
    const table = make();
    table.toggleSort('name');
    table.setSort([]);
    expect(table.view().sort).toEqual([]);
  });
});

describe('tablePipeline — filtering and sorting compose', () => {
  it('keeps the filter when a sort is applied, and vice versa', () => {
    const filterFirst = make();
    filterFirst.setFilter('role', 'admin');
    filterFirst.toggleSort('name');

    const sortFirst = make();
    sortFirst.toggleSort('name');
    sortFirst.setFilter('role', 'admin');

    const expected = ['Charlie', 'Dora'];
    expect(filterFirst.view().rows.map((row) => row.name)).toEqual(expected);
    expect(sortFirst.view().rows.map((row) => row.name)).toEqual(expected);
    expect(filterFirst.view().totalFiltered).toBe(2);
    expect(sortFirst.view().sort).toEqual([{ key: 'name', direction: 'asc' }]);
  });
});

describe('tablePipeline — pagination', () => {
  it('pages the derived rows and counts the whole filtered set', () => {
    const table = make({ pageSize: 3 });
    table.toggleSort('id');
    expect(table.view()).toMatchObject({ page: 1, pageCount: 2, totalFiltered: 4, total: 4 });
    expect(table.view().rows.map((row) => row.id)).toEqual([1, 2, 3]);

    table.setPage(2);
    expect(table.view().rows.map((row) => row.id)).toEqual([4]);
  });

  it('clamps an out-of-range page instead of failing', () => {
    const table = make({ pageSize: 3 });
    table.setPage(99);
    expect(table.view().page).toBe(2);
  });

  it('returns to page 1 when the result set changes', () => {
    const table = make({ pageSize: 3 });
    table.setPage(2);
    table.setFilter('role', 'admin');
    expect(table.view().page).toBe(1);
  });

  it('changes page size, and stops paginating on null', () => {
    const table = make({ pageSize: 1 });
    expect(table.view().pageCount).toBe(4);
    table.setPageSize(2);
    expect(table.view().pageCount).toBe(2);
    table.setPageSize(null);
    expect(table.view()).toMatchObject({ page: 1, pageCount: 1 });
    expect(table.view().rows).toHaveLength(4);
  });

  it('rejects a non-integer page or size', () => {
    const table = make();
    expect(() => table.setPage(1.5)).toThrow(TypeError);
    expect(() => table.setPageSize(0)).toThrow(TypeError);
  });

  it('hands out a copy of the rows when not paginating', () => {
    // The view is memoized, so a caller who mutates `rows` corrupts their own
    // snapshot — but never the pipeline's state, which is the guarantee here.
    const table = make();
    table.view().rows.length = 0;
    table.setPage(1); // invalidates the memo; derives from the untouched source
    expect(table.view().rows).toHaveLength(4);
  });
});

describe('tablePipeline — the read model is memoized', () => {
  it('returns the identical view when no command intervened', () => {
    const table = make();
    expect(table.view()).toBe(table.view());
  });

  it('derives a fresh view after any command', () => {
    const table = make();
    const before = table.view();
    table.setPage(1);
    expect(table.view()).not.toBe(before);
  });
});

describe('tablePipeline — commands are transactions', () => {
  it('emits exactly one change per command, carrying the view', () => {
    const table = make({ pageSize: 3 });
    const seen = [];
    table.on('change', (view) => seen.push(view));

    table.setPage(2);
    table.setFilter('role', 'admin'); // also resets the page: still one event
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(table.view());
    expect(seen[1].page).toBe(1);
  });

  it('coalesces a batch into one change', () => {
    const table = make();
    const listener = vi.fn();
    table.on('change', listener);

    table.batch(() => {
      table.setSource([{ id: 9, name: 'Eve' }]);
      table.setSearch('eve');
      table.setPageSize(10);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].rows).toHaveLength(1);
  });

  it('nests batches and emits once at the outermost close', () => {
    const table = make();
    const listener = vi.fn();
    table.on('change', listener);

    table.batch(() => {
      table.setPage(1);
      table.batch(() => table.setSearch('ada'));
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('announces the partial state when a batch throws, then rethrows', () => {
    const table = make();
    const listener = vi.fn();
    table.on('change', listener);

    expect(() =>
      table.batch(() => {
        table.setSearch('ada');
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(table.view().search).toBe('ada');
  });

  it('stays silent for a batch that issues no command', () => {
    const table = make();
    const listener = vi.fn();
    table.on('change', listener);
    table.batch(() => {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejects a non-function batch', () => {
    expect(() => make().batch('nope')).toThrow(TypeError);
  });

  it('rejects a non-array source', () => {
    expect(() => make().setSource('rows')).toThrow(TypeError);
  });
});

describe('tablePipeline — Node-safety (NFR-14)', () => {
  it('derives with no DOM present at all', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');

    const table = make({ pageSize: 2 });
    table.batch(() => {
      table.setFilter('role', 'admin');
      table.setSearch('a');
      table.toggleSort('name');
      table.setPage(1);
    });

    // Every command and the read model, exercised where a server renders.
    expect(table.view().rows.length).toBeGreaterThan(0);
    expect(table.view().totalFiltered).toBeGreaterThan(0);
  });
});

describe('tablePipeline — observer surface', () => {
  it('unsubscribes through the returned function and through off()', () => {
    const table = make();
    const first = vi.fn();
    const second = vi.fn();

    const off = table.on('change', first);
    table.on('change', second);
    off();
    table.off('change', second);
    table.setPage(1);

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('supports once()', () => {
    const table = make();
    const listener = vi.fn();
    table.once('change', listener);
    table.setPage(1);
    table.setPage(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not expose emit', () => {
    expect(/** @type {any} */ (make()).emit).toBeUndefined();
  });
});

describe('tablePipeline — custom filter operators (roadmap 15.2, ADR-0040)', () => {
  /** @returns {import('../../../../../main/javascript/it/d4np/utils/table.js').TablePipeline<any>} */
  const make = () =>
    tablePipeline({
      source: [{ host: 'gw-01' }, { host: 'gw-02' }, { host: 'srv-01' }],
      columns: [{ key: 'host', searchable: true }],
      operators: { '~': (operand) => (value) => String(value).endsWith(operand) },
    });

  it('compiles a column filter with the caller vocabulary', () => {
    const pipeline = make();
    pipeline.setFilter('host', '~01');
    expect(pipeline.view().rows.map((row) => row.host)).toEqual(['gw-01', 'srv-01']);
  });

  it('uses the same vocabulary for the global search', () => {
    // One pipeline, one grammar: a token that works in a column box and not in
    // the search box would be two grammars wearing one name.
    const pipeline = make();
    pipeline.setSearch('~02');
    expect(pipeline.view().rows.map((row) => row.host)).toEqual(['gw-02']);
  });

  it('leaves the built-in grammar intact', () => {
    const pipeline = make();
    pipeline.setFilter('host', '^gw');
    expect(pipeline.view().totalFiltered).toBe(2);
  });

  it('reads a plain substring the same as ever when no operators are declared', () => {
    const pipeline = tablePipeline({ source: [{ host: 'gw-01' }], columns: [{ key: 'host' }] });
    pipeline.setFilter('host', '~01');
    // Without the vocabulary the token is just text, so nothing matches it.
    expect(pipeline.view().totalFiltered).toBe(0);
  });
});
