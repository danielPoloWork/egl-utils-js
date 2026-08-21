import { describe, it, expect, vi } from 'vitest';
import { remotePipeline, tableQuery } from '../../../../../main/javascript/it/d4np/utils/table.js';

// Spec 06 F88–F91 (roadmap 19.1). The race rules are the reason this file is
// longer than the feature looks: every assertion below that mentions ordering or
// aborting is one an implementation can pass by accident and fail in production.

/**
 * A source whose responses are settled by hand, so a test can interleave them in
 * any order without depending on timing. Returns the `load` plus the levers.
 */
function controllable() {
  /** @type {{ query: any, signal: AbortSignal, resolve: (v: any) => void, reject: (e: any) => void }[]} */
  const calls = [];
  const load = (query, signal) =>
    new Promise((resolve, reject) => {
      calls.push({ query, signal, resolve, reject });
    });
  return { load, calls };
}

/** Let the microtask queue drain so a settled promise reaches its handlers. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const page = (rows, total) => ({ rows, total: total ?? rows.length });

describe('the source contract (F88)', () => {
  it('passes the query and a signal, and applies the rows', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load, pageSize: 2 });

    expect(calls).toHaveLength(1);
    expect(calls[0].query).toEqual({
      filters: {},
      search: '',
      sort: [],
      page: 1,
      pageSize: 2,
    });
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);

    calls[0].resolve(page([{ id: 1 }, { id: 2 }], 7));
    await flush();

    const view = table.view();
    expect(view.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(view.total).toBe(7);
    expect(view.pageCount).toBe(4);
    expect(view.loading).toBe(false);
    expect(view.error).toBeNull();
  });

  it.each([
    ['not an object', 'must resolve to { rows, total }'],
    [{ total: 1 }, '`rows` must be an array'],
    [{ rows: [], total: -1 }, '`total` must be a non-negative integer'],
    [{ rows: [], total: 1.5 }, '`total` must be a non-negative integer'],
  ])(
    'a malformed result becomes a typed error, not an empty table (%o)',
    async (result, message) => {
      const { load, calls } = controllable();
      const table = remotePipeline({ load });
      calls[0].resolve(result);
      await flush();

      expect(table.view().error).toBeInstanceOf(TypeError);
      expect(String(table.view().error.message)).toContain(message);
      expect(table.view().loading).toBe(false);
    },
  );

  it('never imports a transport: any function satisfies the contract', async () => {
    const table = remotePipeline({ load: () => page([{ id: 'sync' }], 1) });
    await flush();
    expect(table.view().rows).toEqual([{ id: 'sync' }]);
  });
});

describe('latest-request-wins, and the loser is aborted (F89)', () => {
  it('aborts the in-flight load when a newer one starts', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load });

    table.setSearch('a');
    expect(calls).toHaveLength(2);
    // Not merely ignored — discarding a response still costs the server the work.
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
    table.destroy();
  });

  it('discards a stale response that arrives FIRST', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load });

    table.setSearch('milan');
    // The first (aborted) request answers late and out of order.
    calls[0].resolve(page([{ id: 'stale' }], 1));
    await flush();
    expect(table.view().rows).toEqual([]);
    expect(table.view().loading).toBe(true);

    calls[1].resolve(page([{ id: 'fresh' }], 1));
    await flush();
    expect(table.view().rows).toEqual([{ id: 'fresh' }]);
  });

  it('never leaves the view describing one query with another query’s rows', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load });

    table.setSearch('a');
    table.setSearch('ab');
    calls[0].resolve(page([{ q: 'initial' }], 1));
    calls[1].resolve(page([{ q: 'a' }], 1));
    await flush();

    // Only the third is current; neither loser applied.
    expect(table.view().rows).toEqual([]);
    calls[2].resolve(page([{ q: 'ab' }], 1));
    await flush();
    expect(table.view().rows).toEqual([{ q: 'ab' }]);
    expect(table.view().query.search).toBe('ab');
  });

  it('does not re-issue an identical query', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load });
    calls[0].resolve(page([], 0));
    await flush();

    table.setSearch('x');
    expect(calls).toHaveLength(2);
    calls[1].resolve(page([], 0));
    await flush();

    table.setSearch('x'); // same state, same query
    expect(calls).toHaveLength(2);

    table.refresh(); // the deliberate way to ask again
    expect(calls).toHaveLength(3);
    table.destroy();
  });

  it('an aborted load produces no error state', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load });

    table.setSearch('a');
    // A real transport rejects when its signal aborts; this one does it by hand.
    calls[0].reject(new DOMException('aborted', 'AbortError'));
    await flush();

    expect(table.view().error).toBeNull();
    expect(table.view().loading).toBe(true); // the newer load is still running
    table.destroy();
  });
});

describe('load status in the view (F91)', () => {
  it('reports loading, and a failure keeps the previous rows', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load });
    calls[0].resolve(page([{ id: 'first' }], 1));
    await flush();

    table.setSearch('boom');
    expect(table.view().loading).toBe(true);
    expect(table.view().rows).toEqual([{ id: 'first' }]); // still there while loading

    const failure = new Error('502');
    calls[1].reject(failure);
    await flush();

    // An error banner over stale data is recoverable; an empty table is not.
    expect(table.view().error).toBe(failure);
    expect(table.view().rows).toEqual([{ id: 'first' }]);
    expect(table.view().loading).toBe(false);
  });

  it('clears the error when a later load succeeds', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load });
    calls[0].reject(new Error('down'));
    await flush();
    expect(table.view().error).toBeInstanceOf(Error);

    table.refresh();
    calls[1].resolve(page([{ id: 'ok' }], 1));
    await flush();
    expect(table.view().error).toBeNull();
    expect(table.view().rows).toEqual([{ id: 'ok' }]);
  });

  it('emits change on both edges of a load', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load, immediate: false });
    const seen = [];
    table.on('change', (view) => seen.push(view.loading));

    table.setSearch('a');
    calls[0].resolve(page([], 0));
    await flush();

    expect(seen).toEqual([true, false]);
    table.destroy();
  });
});

describe('the query (F90)', () => {
  it('is stable across insertion order, so it works as a cache key', () => {
    const a = tableQuery({
      filters: { b: '2', a: '1' },
      search: '',
      sort: [],
      page: 1,
      pageSize: null,
    });
    const b = tableQuery({
      filters: { a: '1', b: '2' },
      search: '',
      sort: [],
      page: 1,
      pageSize: null,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('refuses a predicate filter, because a server cannot be sent one', () => {
    expect(() =>
      tableQuery({ filters: { a: () => true }, search: '', sort: [], page: 1, pageSize: null }),
    ).toThrow(/carries only strings/);
  });

  it('is JSON-safe', () => {
    const query = tableQuery({
      filters: { city: 'milan' },
      search: 'x',
      sort: [{ key: 'total', direction: 'desc' }],
      page: 3,
      pageSize: 20,
    });
    expect(JSON.parse(JSON.stringify(query))).toEqual(query);
  });
});

describe('the command vocabulary mirrors tablePipeline', () => {
  it('resets to page 1 on any command that changes the result set', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load, pageSize: 10 });
    table.setPage(5);
    expect(table.view().page).toBe(5);

    table.setSearch('narrow');
    expect(table.view().page).toBe(1);
    table.destroy();
    expect(calls.length).toBeGreaterThan(0);
  });

  it('cycles a sort asc → desc → none', () => {
    const { load } = controllable();
    const table = remotePipeline({ load, columns: [{ key: 'name' }] });
    table.toggleSort('name');
    expect(table.view().sort).toEqual([{ key: 'name', direction: 'asc' }]);
    table.toggleSort('name');
    expect(table.view().sort).toEqual([{ key: 'name', direction: 'desc' }]);
    table.toggleSort('name');
    expect(table.view().sort).toEqual([]);
    table.destroy();
  });

  it('batches several commands into ONE load', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load, immediate: false });

    table.batch(() => {
      table.setSearch('a');
      table.setPage(2);
      table.setPageSize(50);
    });

    expect(calls).toHaveLength(1);
    table.destroy();
  });

  it('closes the key space when columns are declared', () => {
    const { load } = controllable();
    const table = remotePipeline({ load, columns: [{ key: 'name' }], immediate: false });
    expect(() => table.setFilter('nmae', 'x')).toThrow(/unknown column 'nmae'/);
    table.destroy();
  });

  it('refuses a predicate at the command, naming why', () => {
    const { load } = controllable();
    const table = remotePipeline({ load, immediate: false });
    expect(() => table.setFilter('a', () => true)).toThrow(/cannot be sent to a server/);
    table.destroy();
  });

  it('rejects unknown options (ADR-0047)', () => {
    expect(() => remotePipeline({ load: () => page([]), pagesize: 10 })).toThrow(
      /unknown option 'pagesize'/,
    );
  });
});

describe('teardown (NFR-15)', () => {
  it('destroy aborts the in-flight load and refuses later commands', async () => {
    const { load, calls } = controllable();
    const table = remotePipeline({ load });
    table.destroy();

    expect(calls[0].signal.aborted).toBe(true);
    expect(() => table.setSearch('x')).toThrow(/after destroy\(\)/);
    // A response arriving after destroy changes nothing.
    calls[0].resolve(page([{ id: 'late' }], 1));
    await flush();
    expect(table.view().rows).toEqual([]);
  });

  it('is idempotent, and an aborted signal destroys it', () => {
    const controller = new AbortController();
    const { load, calls } = controllable();
    const table = remotePipeline({ load, signal: controller.signal });
    controller.abort();
    expect(calls[0].signal.aborted).toBe(true);
    expect(() => table.destroy()).not.toThrow();
  });

  it('a signal already aborted means no load is ever issued', () => {
    const { load, calls } = controllable();
    remotePipeline({ load, signal: AbortSignal.abort() });
    expect(calls).toHaveLength(0);
  });
});

describe('Node-safety (NFR-29)', () => {
  it('needs no document, window or fetch', () => {
    expect(typeof globalThis.document).toBe('undefined');
    const table = remotePipeline({ load: () => page([{ id: 1 }], 1) });
    expect(table.view().rows).toEqual([]);
    expect(vi.isMockFunction(table.view)).toBe(false);
  });
});
