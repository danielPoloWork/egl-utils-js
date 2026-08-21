import { describe, it, expect } from 'vitest';
import { remotePipeline, tableQuery } from '../../../../../main/javascript/it/d4np/utils/table.js';

// The argument-validation half of spec 06 F88–F91. Split from
// `table-remote.test.js` so that file stays about the race rules, which are the
// hard part; these are the boring, exhaustive ones — and the ones that keep the
// ADR-0047 posture honest for a new surface.

const ok = () => ({ rows: [], total: 0 });
const idle = (extra = {}) => remotePipeline({ load: ok, immediate: false, ...extra });

describe('constructor validation', () => {
  it.each([[undefined], [null], ['nope'], [42]])('refuses a non-object options bag (%s)', (bad) => {
    expect(() => remotePipeline(bad)).toThrow(/options must be an object with a `load` function/);
  });

  it.each([[undefined], [null], ['nope'], [{}]])(
    'refuses a load that is not a function (%s)',
    (bad) => {
      expect(() => remotePipeline({ load: bad })).toThrow(/options.load must be a function/);
    },
  );

  it('refuses a non-boolean immediate', () => {
    expect(() => remotePipeline({ load: ok, immediate: 'yes' })).toThrow(
      /options.immediate must be a boolean/,
    );
  });

  it.each([[0], [-1], [1.5], ['20'], [Number.NaN]])('refuses a bad pageSize (%s)', (bad) => {
    expect(() => remotePipeline({ load: ok, pageSize: bad })).toThrow(
      /options.pageSize must be a positive integer/,
    );
  });

  it('refuses a signal that is not an AbortSignal', () => {
    expect(() => remotePipeline({ load: ok, signal: {} })).toThrow(
      /options.signal must be an AbortSignal/,
    );
  });

  it('refuses columns that are not an array', () => {
    expect(() => remotePipeline({ load: ok, columns: 'name' })).toThrow(
      /options.columns must be an array/,
    );
  });

  it.each([[null], ['name'], [{}], [{ key: '' }], [{ key: 7 }]])(
    'refuses a malformed column (%o)',
    (bad) => {
      expect(() => remotePipeline({ load: ok, columns: [bad] })).toThrow(
        /every column needs a non-empty string `key`/,
      );
    },
  );
});

describe('command validation', () => {
  it('refuses a key that is not a non-empty string', () => {
    const table = idle();
    expect(() => table.setFilter('', 'x')).toThrow(/key must be a non-empty string/);
    expect(() => table.setFilter(7, 'x')).toThrow(/key must be a non-empty string/);
    table.destroy();
  });

  it.each([[null], [undefined], ['']])('clears a filter with %s', (clearer) => {
    const table = idle();
    table.setFilter('city', 'milan');
    expect(table.view().filters).toEqual({ city: 'milan' });
    table.setFilter('city', clearer);
    expect(table.view().filters).toEqual({});
    table.destroy();
  });

  it('refuses a non-string search', () => {
    const table = idle();
    expect(() => table.setSearch(7)).toThrow(/setSearch\(text\) requires a string/);
    table.destroy();
  });

  it.each([[0], [-2], [1.5], ['3']])('refuses a bad page (%s)', (bad) => {
    const table = idle();
    expect(() => table.setPage(bad)).toThrow(/setPage\(page\) must be a positive integer/);
    table.destroy();
  });

  it('refuses a bad pageSize, but accepts null to stop paginating', () => {
    const table = idle({ pageSize: 10 });
    expect(() => table.setPageSize(0)).toThrow(
      /setPageSize\(pageSize\) must be a positive integer/,
    );
    table.setPageSize(null);
    expect(table.view().pageSize).toBeNull();
    expect(table.view().pageCount).toBe(1);
    table.destroy();
  });

  it('refuses a non-function batch', () => {
    const table = idle();
    expect(() => table.batch('nope')).toThrow(/batch\(fn\) requires a function/);
    table.destroy();
  });
});

describe('setSort', () => {
  it('replaces the sort outright, for multi-key ordering', () => {
    const table = idle({ columns: [{ key: 'a' }, { key: 'b' }] });
    table.setSort([
      { key: 'a', direction: 'desc' },
      { key: 'b', direction: 'asc' },
    ]);
    expect(table.view().sort).toEqual([
      { key: 'a', direction: 'desc' },
      { key: 'b', direction: 'asc' },
    ]);
    table.destroy();
  });

  it('resets to page 1, like every command that changes the result set', () => {
    const table = idle();
    table.setPage(4);
    table.setSort([{ key: 'a', direction: 'asc' }]);
    expect(table.view().page).toBe(1);
    table.destroy();
  });

  it('refuses a non-array', () => {
    const table = idle();
    expect(() => table.setSort('a')).toThrow(/setSort\(entries\) requires an array/);
    table.destroy();
  });

  it.each([[null], ['a'], [7]])('refuses a non-object entry (%s)', (bad) => {
    const table = idle();
    expect(() => table.setSort([bad])).toThrow(/every sort entry must be an object/);
    table.destroy();
  });

  it('refuses a direction that is not asc or desc', () => {
    const table = idle();
    expect(() => table.setSort([{ key: 'a', direction: 'up' }])).toThrow(
      /sort direction for 'a' must be 'asc' or 'desc'/,
    );
    table.destroy();
  });

  it('refuses an undeclared key when columns close the space', () => {
    const table = idle({ columns: [{ key: 'a' }] });
    expect(() => table.setSort([{ key: 'b', direction: 'asc' }])).toThrow(/unknown column 'b'/);
    table.destroy();
  });
});

describe('every command refuses to run after destroy (NFR-15)', () => {
  const commands = [
    ['setFilter', (t) => t.setFilter('a', 'x')],
    ['setSearch', (t) => t.setSearch('x')],
    ['toggleSort', (t) => t.toggleSort('a')],
    ['setSort', (t) => t.setSort([])],
    ['setPage', (t) => t.setPage(2)],
    ['setPageSize', (t) => t.setPageSize(5)],
    ['batch', (t) => t.batch(() => {})],
    ['refresh', (t) => t.refresh()],
  ];

  it.each(commands)('%s throws', (name, run) => {
    const table = idle();
    table.destroy();
    expect(() => run(table)).toThrow(new RegExp(`${name} was called after destroy\\(\\)`));
  });
});

describe('a source that throws synchronously', () => {
  it('is a failed load, not a thrown command', async () => {
    const boom = new Error('sync boom');
    const table = remotePipeline({
      load: () => {
        throw boom;
      },
    });
    // The command returned normally; the failure is in the view where a renderer
    // can show it, which is the whole point of F91.
    expect(table.view().error).toBe(boom);
    expect(table.view().loading).toBe(false);
    table.destroy();
  });
});

describe('subscription surface', () => {
  it('on returns an unsubscribe, and off works too', () => {
    const table = idle();
    const seen = [];
    const off = table.on('change', (view) => seen.push(view.search));
    table.setSearch('a');
    off();
    table.setSearch('b');
    expect(seen).toEqual(['a']);

    const listener = (view) => seen.push(view.search);
    table.on('change', listener);
    table.off('change', listener);
    table.setSearch('c');
    expect(seen).toEqual(['a']);
    table.destroy();
  });

  it('once fires exactly once', () => {
    const table = idle();
    let count = 0;
    table.once('change', () => (count += 1));
    table.setSearch('a');
    table.setSearch('b');
    expect(count).toBe(1);
    table.destroy();
  });
});

describe('the memoized view', () => {
  it('returns the identical object until state changes', () => {
    const table = idle();
    const before = table.view();
    expect(table.view()).toBe(before);

    table.setSearch('a');
    const after = table.view();
    expect(after).not.toBe(before); // a command invalidates it
    expect(table.view()).toBe(after); // and the new one memoizes in turn
    table.destroy();
  });
});

describe('tableQuery edge cases', () => {
  it('carries an unpaginated state as pageSize null', () => {
    expect(
      tableQuery({ filters: {}, search: '', sort: [], page: 1, pageSize: null }).pageSize,
    ).toBeNull();
  });

  it('names the offending key when a filter is not a string', () => {
    expect(() =>
      tableQuery({ filters: { city: 7 }, search: '', sort: [], page: 1, pageSize: null }),
    ).toThrow(/filter 'city' is a number/);
  });
});
