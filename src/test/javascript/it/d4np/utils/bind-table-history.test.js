// @vitest-environment jsdom
// Example tests (roadmap 19.2, spec 06 §2 item F93, NFR-15, ADR-0063) for the
// binding between a table pipeline and the address bar: one 'change' per restore,
// the page applied last, Back and Forward moving through table states, and a
// teardown that leaves no listener behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindTableHistory } from '../../../../../main/javascript/it/d4np/utils/dom.js';
import {
  remotePipeline,
  tablePipeline,
} from '../../../../../main/javascript/it/d4np/utils/table.js';

const ROWS = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1,
  name: `n${index + 1}`,
  status: index % 2 === 0 ? 'active' : 'archived',
}));

const COLUMNS = [{ key: 'id' }, { key: 'name' }, { key: 'status' }];

/** @type {(() => void)[]} */
let release;

/** @param {string} search */
function at(search) {
  window.history.replaceState(null, '', `/list${search}`);
}

/** @param {object} [options] */
function table(options = {}) {
  return tablePipeline({ source: ROWS, columns: COLUMNS, ...options });
}

/**
 * Wait until a condition holds.
 *
 * jsdom traverses its session history asynchronously, exactly as a browser does,
 * and it takes more than one macrotask to get there. Polling rather than sleeping
 * a fixed span is deliberate: a test that asserts how fast the machine is will
 * block some unrelated future PR on a loaded runner (the 19.1 lesson).
 *
 * @param {() => boolean} condition
 * @param {string} what - Named in the timeout message.
 */
async function until(condition, what) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

beforeEach(() => {
  at('');
  release = [];
});

afterEach(() => {
  for (const fn of release) fn();
  vi.restoreAllMocks();
});

describe('restoring from the URL', () => {
  it('applies the whole state on bind', () => {
    at('?q=n&filter.status=active&sort=id%3Adesc&page=2&size=3');
    const pipeline = table();
    release.push(bindTableHistory(pipeline));

    const view = pipeline.view();
    expect(view.search).toBe('n');
    expect(view.filters).toEqual({ status: 'active' });
    expect(view.sort).toEqual([{ key: 'id', direction: 'desc' }]);
    expect(view.pageSize).toBe(3);
    expect(view.page).toBe(2);
  });

  it('fires exactly one change for a four-part restore (the batch rule)', () => {
    at('?q=n&filter.status=active&sort=id%3Adesc&page=2&size=2');
    const pipeline = table();
    const changes = vi.fn();
    pipeline.on('change', changes);

    release.push(bindTableHistory(pipeline));

    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('keeps the restored page, which every other command resets to 1', () => {
    // The ordering rule, stated as a test: `setFilter`, `setSearch`, `setSort` and
    // `setPageSize` each set page = 1 inside the same batch, so a page restored
    // before them would be silently overwritten and every shared link would land
    // on page 1.
    at('?filter.status=active&sort=id%3Aasc&size=2&page=3');
    const pipeline = table();
    release.push(bindTableHistory(pipeline));
    expect(pipeline.view().page).toBe(3);
  });

  it('clears a filter the URL no longer carries', () => {
    const pipeline = table();
    pipeline.setFilter('status', 'archived');
    at('?q=n1');
    release.push(bindTableHistory(pipeline));
    expect(pipeline.view().filters).toEqual({});
    expect(pipeline.view().search).toBe('n1');
  });

  it('restores nothing but the defaults from a URL with no table parameters', () => {
    at('?tab=orders');
    const pipeline = table({ pageSize: 4 });
    release.push(bindTableHistory(pipeline));
    const view = pipeline.view();
    expect(view.search).toBe('');
    expect(view.page).toBe(1);
    // The URL is the whole state, so a pipeline constructed with a page size and
    // bound to a URL that names none becomes unpaginated. Stated here because it
    // is a consequence a caller has to know: put the default in the URL, or accept
    // that the URL wins.
    expect(view.pageSize).toBe(null);
  });
});

describe('writing to the URL', () => {
  it('pushes an entry per change by default', () => {
    at('?size=2');
    const pipeline = table();
    release.push(bindTableHistory(pipeline));
    const before = window.history.length;

    pipeline.setSearch('n1');

    expect(window.location.search).toBe('?q=n1&size=2');
    expect(window.history.length).toBe(before + 1);
  });

  it('replaces instead, when asked', () => {
    const pipeline = table();
    release.push(bindTableHistory(pipeline, { mode: 'replace' }));
    const before = window.history.length;

    pipeline.setSearch('n1');

    expect(window.location.search).toBe('?q=n1');
    expect(window.history.length).toBe(before);
  });

  it('writes once for a batch, not once per command', () => {
    at('?size=2');
    const pipeline = table();
    release.push(bindTableHistory(pipeline));
    const before = window.history.length;

    pipeline.batch(() => {
      pipeline.setSearch('n');
      pipeline.setSort([{ key: 'id', direction: 'desc' }]);
      pipeline.setPage(2);
    });

    expect(window.history.length).toBe(before + 1);
    expect(window.location.search).toBe('?q=n&sort=id%3Adesc&page=2&size=2');
  });

  it('writes nothing when a change did not change the serialization', () => {
    const pipeline = table();
    release.push(bindTableHistory(pipeline));
    const before = window.history.length;

    // A new source is a real change and a real 'change' — and no state the URL
    // describes. Pushing an identical entry for it would fill the back button
    // with steps that go nowhere.
    pipeline.setSource(ROWS.slice(0, 3));

    expect(window.history.length).toBe(before);
  });

  it('preserves foreign parameters and the fragment', () => {
    at('?tab=orders#row-4');
    const pipeline = table();
    release.push(bindTableHistory(pipeline));

    pipeline.setSearch('n1');

    expect(window.location.search).toBe('?tab=orders&q=n1');
    expect(window.location.hash).toBe('#row-4');
  });

  it('carries the application history state through a write', () => {
    window.history.replaceState({ scroll: 120 }, '', '/list');
    const pipeline = table();
    release.push(bindTableHistory(pipeline, { mode: 'replace' }));

    pipeline.setSearch('n1');

    expect(window.history.state).toEqual({ scroll: 120 });
  });

  it('normalizes the URL on bind with replaceState, never a new entry', () => {
    at('?page=abc&size=0&sort=id%3Asideways');
    const pipeline = table();
    const before = window.history.length;

    release.push(bindTableHistory(pipeline));

    // Every parameter was malformed, so the state is the default and the URL says
    // so — and binding a table added no history entry.
    expect(window.location.search).toBe('');
    expect(window.history.length).toBe(before);
  });

  it('leaves the URL alone on bind when it already matches', () => {
    at('?q=n1');
    const pipeline = table();
    const before = window.history.length;
    release.push(bindTableHistory(pipeline));
    expect(window.location.search).toBe('?q=n1');
    expect(window.history.length).toBe(before);
  });
});

describe('Back and Forward', () => {
  it('restores the previous state on popstate, in one change', async () => {
    const pipeline = table();
    release.push(bindTableHistory(pipeline));

    pipeline.setSearch('n1');
    expect(window.location.search).toBe('?q=n1');

    const changes = vi.fn();
    pipeline.on('change', changes);
    window.history.back();
    await until(() => pipeline.view().search === '', 'the popstate restore');

    expect(window.location.search).toBe('');
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('does not push an entry for the state Back navigated to', async () => {
    const pipeline = table();
    release.push(bindTableHistory(pipeline));

    pipeline.setSearch('n1');
    pipeline.setSearch('n2');
    const afterTwoWrites = window.history.length;

    window.history.back();
    await until(() => pipeline.view().search === 'n1', 'the popstate restore');

    expect(window.history.length).toBe(afterTwoWrites);
  });

  it('moves forward again', async () => {
    const pipeline = table();
    release.push(bindTableHistory(pipeline));

    pipeline.setSearch('n1');
    window.history.back();
    await until(() => pipeline.view().search === '', 'Back');

    window.history.forward();
    await until(() => pipeline.view().search === 'n1', 'Forward');
  });
});

describe('a URL nobody validated', () => {
  it('skips a filter naming a column that does not exist, and reports it', () => {
    at('?filter.bogus=1&filter.status=active');
    const pipeline = table();
    const onIgnored = vi.fn();

    release.push(bindTableHistory(pipeline, { onIgnored }));

    expect(pipeline.view().filters).toEqual({ status: 'active' });
    expect(onIgnored).toHaveBeenCalledTimes(1);
    const [entries] = onIgnored.mock.calls[0];
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('filter');
    expect(entries[0].key).toBe('bogus');
    expect(entries[0].reason).toBeInstanceOf(TypeError);
    // And the bad parameter is gone from the URL, which is the report a caller
    // gets even without a callback.
    expect(window.location.search).toBe('?filter.status=active');
  });

  it('keeps the sort entries around a stale one', () => {
    at('?sort=bogus%3Aasc&sort=id%3Adesc&sort=gone%3Aasc');
    const pipeline = table();
    const onIgnored = vi.fn();

    release.push(bindTableHistory(pipeline, { onIgnored }));

    expect(pipeline.view().sort).toEqual([{ key: 'id', direction: 'desc' }]);
    expect(onIgnored.mock.calls[0][0].map((entry) => entry.key)).toEqual(['bogus', 'gone']);
    expect(window.location.search).toBe('?sort=id%3Adesc');
  });

  it('does not call onIgnored when nothing was skipped', () => {
    at('?q=n1');
    const onIgnored = vi.fn();
    release.push(bindTableHistory(table(), { onIgnored }));
    expect(onIgnored).not.toHaveBeenCalled();
  });

  it('survives a filter on a column declared unfilterable', () => {
    at('?filter.name=x');
    const pipeline = tablePipeline({
      source: ROWS,
      columns: [{ key: 'id' }, { key: 'name', filterable: false }],
    });
    release.push(bindTableHistory(pipeline));
    expect(pipeline.view().filters).toEqual({});
    expect(window.location.search).toBe('');
  });
});

describe('teardown', () => {
  it('detaches the popstate listener and stops writing', async () => {
    const pipeline = table();
    const unbind = bindTableHistory(pipeline);

    pipeline.setSearch('n1');
    unbind();

    pipeline.setSearch('n2');
    expect(window.location.search).toBe('?q=n1');

    window.history.back();
    await until(() => window.location.search === '', 'the URL to move');
    // The URL moved; the pipeline did not follow, because nothing is listening.
    expect(pipeline.view().search).toBe('n2');
  });

  it('is idempotent', () => {
    const unbind = bindTableHistory(table());
    unbind();
    expect(() => unbind()).not.toThrow();
  });

  it('tears down when a signal aborts', () => {
    const controller = new AbortController();
    const pipeline = table();
    bindTableHistory(pipeline, { signal: controller.signal });

    controller.abort();
    pipeline.setSearch('n1');

    expect(window.location.search).toBe('');
  });

  it('binds nothing at all when the signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const pipeline = table();
    bindTableHistory(pipeline, { signal: controller.signal });

    pipeline.setSearch('n1');
    expect(window.location.search).toBe('');
  });
});

describe('contract', () => {
  it('rejects a pipeline missing a command a restore needs', () => {
    const partial = { view: () => ({}), on: () => () => {}, batch: (fn) => fn() };
    expect(() => bindTableHistory(partial)).toThrow(/pipeline.setFilter\(\) is required/);
    expect(() => bindTableHistory(null)).toThrow(/pipeline must be a table pipeline/);
  });

  it('rejects malformed and unknown options', () => {
    expect(() => bindTableHistory(table(), { mode: 'PUSH' })).toThrow(
      /options.mode must be 'push' or 'replace'/,
    );
    expect(() => bindTableHistory(table(), { prefix: 1 })).toThrow(
      /options.prefix must be a string/,
    );
    expect(() => bindTableHistory(table(), { onIgnored: 'yes' })).toThrow(
      /options.onIgnored must be a function/,
    );
    expect(() => bindTableHistory(table(), { signal: 'later' })).toThrow(
      /options.signal must be an AbortSignal/,
    );
    expect(() => bindTableHistory(table(), { onIgnore: () => {} })).toThrow(
      /unknown option 'onIgnore'/,
    );
  });

  it('names its contract when there is no address bar', () => {
    expect(() => bindTableHistory(table(), { window: {} })).toThrow(
      /needs an address bar, so pass options.window/,
    );
    expect(() => bindTableHistory(table(), { window: { history: {}, location: {} } })).toThrow(
      /needs an address bar/,
    );
    // A window that can attach a listener but not detach one is refused too, so
    // teardown never has to ask whether it can do its job (NFR-15).
    const halfAWindow = {
      history: { pushState() {}, replaceState() {}, state: null },
      location: { search: '', pathname: '/', hash: '' },
      addEventListener() {},
    };
    expect(() => bindTableHistory(table(), { window: halfAWindow })).toThrow(
      /needs an address bar/,
    );
  });

  it('accepts an options bag given as null', () => {
    /** @type {(() => void) | undefined} */
    let unbind;
    expect(() => {
      unbind = bindTableHistory(table(), /** @type {never} */ (null));
    }).not.toThrow();
    // Released like every other binding in this file: a stray popstate listener
    // on the shared window would quietly restore into a dead pipeline in the next
    // test, which is the class of leak NFR-15 exists to prevent.
    release.push(/** @type {() => void} */ (unbind));
  });

  it('refuses at bind time a pipeline already holding a predicate filter', () => {
    const pipeline = table();
    pipeline.setFilter('id', (value) => Number(value) > 4);
    // Refused rather than restored over: a restore clears every filter the URL
    // does not name, so binding would have silently discarded this one.
    expect(() => bindTableHistory(pipeline)).toThrow(/filter 'id' is a function/);
    expect(typeof pipeline.view().filters.id).toBe('function');
  });

  it('throws out of the command that sets a predicate filter after binding', () => {
    const pipeline = table();
    release.push(bindTableHistory(pipeline));
    // The write happens in this command's own 'change', and the EventEmitter
    // rethrows a lone listener failure — so the mistake surfaces at the call that
    // made it rather than as a URL that quietly stopped describing the table.
    expect(() => pipeline.setFilter('id', (value) => Number(value) > 4)).toThrow(
      /filter 'id' is a function/,
    );
  });

  it('takes an injected window, and touches no other', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.test/list?q=injected',
    });
    const pipeline = table();
    release.push(bindTableHistory(pipeline, { window: dom.window }));

    expect(pipeline.view().search).toBe('injected');
    pipeline.setSearch('changed');
    expect(dom.window.location.search).toBe('?q=changed');
    // The ambient window, which this binding was never given, is untouched.
    expect(window.location.search).toBe('');
  });
});

describe('two tables on one page', () => {
  it('keeps each binding to its own parameters', () => {
    at('?orders.q=n&invoices.page=3&invoices.size=2&size=2');
    const orders = table();
    const invoices = table();

    release.push(bindTableHistory(orders, { prefix: 'orders', mode: 'replace' }));
    release.push(bindTableHistory(invoices, { prefix: 'invoices', mode: 'replace' }));

    expect(orders.view().search).toBe('n');
    expect(invoices.view().page).toBe(3);
    // The unprefixed `size=2` is nobody's, and neither binding touched it.
    expect(new URLSearchParams(window.location.search).get('size')).toBe('2');

    orders.setSearch('n1');

    const after = new URLSearchParams(window.location.search);
    expect(after.get('orders.q')).toBe('n1');
    expect(after.get('invoices.page')).toBe('3');
    expect(after.get('invoices.size')).toBe('2');
    expect(after.get('size')).toBe('2');
    expect(invoices.view().page).toBe(3);
  });
});

describe('with the remote sibling', () => {
  it('restores a four-part state as one request', () => {
    at('?q=n&filter.status=active&sort=id%3Adesc&page=2&size=2');
    /** @type {any[]} */
    const calls = [];
    const pipeline = remotePipeline({
      immediate: false,
      load: (query) => {
        calls.push(query);
        return Promise.resolve({ rows: [], total: 0 });
      },
    });

    release.push(bindTableHistory(pipeline));

    // One batch, one query — not four requests racing each other.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      filters: { status: 'active' },
      search: 'n',
      sort: [{ key: 'id', direction: 'desc' }],
      page: 2,
      pageSize: 2,
    });
    pipeline.destroy();
  });
});
