/**
 * egl-utils-js/table — the remote pipeline (spec 06 F88–F91, roadmap 19.1).
 *
 * {@link tablePipeline} derives a view from rows the caller already holds. This
 * one holds the same *question* — which filters, which search, which sort, which
 * page — and asks a server to answer it, because a table over ten thousand
 * records does not ship them to the browser.
 *
 * **It is a sibling of `tablePipeline`, not a wrapper around it** (ADR-0062).
 * The two share a command vocabulary deliberately, so moving a table from local
 * to remote data changes where the rows come from and nothing a caller has to
 * relearn — but they do not share an implementation, because feeding a server's
 * already-filtered page into a pipeline that filters again produces silently
 * wrong data, and no amount of care makes that impossible if the wiring allows
 * it at all.
 *
 * **The transport is injected, never imported.** `load` is any function; this
 * module imports no `fetch`, no `httpClient`, no `createResource` (the ADR-0025
 * injection rule), so `/table` stays pure, Node-safe and free of a network
 * dependency it would only sometimes use.
 *
 * @module egl-utils-js/table
 */

import { EventEmitter } from './events.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @typedef {object} TableQuerySort
 * @property {string} key
 * @property {'asc' | 'desc'} direction
 */

/**
 * The pipeline's state as a plain, JSON-safe value (F90).
 *
 * Transport-neutral on purpose: not a query string, not `URLSearchParams`, and
 * carrying no server's parameter naming. Translating it into whatever an
 * endpoint expects is the caller's `load`, which is the one place that knows.
 *
 * @typedef {object} TableQuery
 * @property {Record<string, string>} filters - Per-column filter expressions,
 *   as typed. Only strings — see {@link tableQuery}.
 * @property {string} search - The global search text; `''` when unset.
 * @property {TableQuerySort[]} sort - Sort keys, most significant first.
 * @property {number} page - 1-based.
 * @property {number | null} pageSize - `null` means unpaginated.
 */

/**
 * @template [Row=any]
 * @typedef {object} RemoteTableView
 * @property {Row[]} rows - The rows the server returned for this query.
 * @property {number} total - The server's count of rows matching the query,
 *   across all pages — what a "showing X of Y" label wants.
 * @property {number} page
 * @property {number} pageCount - Derived from `total` and `pageSize`; at least 1.
 * @property {TableQuerySort[]} sort
 * @property {Record<string, string>} filters
 * @property {string} search
 * @property {number | null} pageSize
 * @property {boolean} loading - A load is in flight.
 * @property {unknown} error - The last load's failure, or `null`. Cleared when a
 *   later load succeeds. An abort is not a failure and never appears here.
 * @property {TableQuery} query - The query these rows answer. Present so a
 *   renderer can tell whether what it shows matches what was asked.
 */

/**
 * @typedef {object} TableState
 * @property {Record<string, unknown>} filters
 * @property {string} search
 * @property {readonly TableQuerySort[]} sort
 * @property {number} page
 * @property {number | null} pageSize
 */

/**
 * Build the JSON-safe query for a state (F90).
 *
 * Pure, and stable: two equal states produce deep-equal objects with their keys
 * in the same order, so the result works as a cache key and as the value F89
 * compares to decide whether a load is worth issuing.
 *
 * @param {TableState} state
 * @returns {TableQuery}
 * @throws {TypeError} If a filter is not a string. `tablePipeline` accepts a
 *   predicate function as a filter, which is right for local data and
 *   impossible for remote: a function cannot be serialized, and a query that
 *   silently dropped it would ask the server a different question than the one
 *   the caller set — returning rows that look filtered and are not.
 */
export function tableQuery(state) {
  /** @type {Record<string, string>} */
  const filters = {};
  // Sorted so the output is order-stable across insertion orders: two pipelines
  // in the same state must serialize identically for the cache-key claim.
  for (const key of Object.keys(state.filters).sort()) {
    const value = state.filters[key];
    if (typeof value !== 'string') {
      throw new TypeError(
        `tableQuery: filter '${key}' is a ${typeof value}, and a remote query carries only strings`,
      );
    }
    filters[key] = value;
  }
  return {
    filters,
    search: state.search,
    sort: state.sort.map((entry) => ({ key: entry.key, direction: entry.direction })),
    page: state.page,
    pageSize: state.pageSize,
  };
}

/**
 * Structural equality for two queries — the F89 "an identical query does not
 * re-issue" rule. Exact by construction: {@link tableQuery} emits stable key
 * order, so comparing the serialized form is comparing the value.
 *
 * @param {TableQuery} a
 * @param {TableQuery} b
 * @returns {boolean}
 */
function sameQuery(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Validate what the source returned (F88).
 *
 * A server that answers the wrong shape must fail at the boundary rather than
 * produce an empty table: "no results" and "we could not read the response"
 * look identical to a user and need different fixes.
 *
 * @param {unknown} result
 * @returns {{ rows: any[], total: number }}
 */
function readResult(result) {
  if (result === null || typeof result !== 'object') {
    throw new TypeError('remotePipeline: load() must resolve to { rows, total }');
  }
  const { rows, total } = /** @type {{ rows: unknown, total: unknown }} */ (result);
  if (!Array.isArray(rows)) {
    throw new TypeError('remotePipeline: load() result `rows` must be an array');
  }
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) {
    throw new TypeError('remotePipeline: load() result `total` must be a non-negative integer');
  }
  return { rows: rows.slice(), total };
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {asserts value is number}
 */
function assertPositiveInteger(value, name) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

/**
 * Validate the column declarations and return the closed key space.
 *
 * @param {unknown} columns
 * @returns {Set<string> | null} `null` when none were declared — "any key goes".
 */
function keySpace(columns) {
  if (columns === undefined) return null;
  if (!Array.isArray(columns)) {
    throw new TypeError('remotePipeline: options.columns must be an array');
  }
  /** @type {Set<string>} */
  const keys = new Set();
  for (const column of columns) {
    if (
      column === null ||
      typeof column !== 'object' ||
      typeof column.key !== 'string' ||
      column.key === ''
    ) {
      throw new TypeError('remotePipeline: every column needs a non-empty string `key`');
    }
    keys.add(column.key);
  }
  return keys;
}

/**
 * @typedef {object} RemotePipelineOptions
 * @property {(query: TableQuery, signal: AbortSignal) => unknown} load - The
 *   transport (F88). Receives the query and a signal this pipeline owns, and
 *   returns (or resolves to) `{rows, total}`. Injected, never imported: any
 *   `httpClient`, `createResource`, bare `fetch` wrapper or in-memory fake
 *   satisfies it.
 * @property {readonly { key: string }[]} [columns] - Declaring them closes the
 *   key space, so addressing an undeclared key is a `TypeError` rather than a
 *   filter the server silently ignores.
 * @property {number} [pageSize] - Rows per page; omitted means unpaginated.
 * @property {boolean} [immediate=true] - Issue the first load on construction.
 *   `false` is for a caller who restores state first (roadmap 19.2) and then
 *   loads once, rather than loading twice.
 * @property {AbortSignal} [signal] - Aborting destroys the pipeline (NFR-15).
 */

/**
 * A pipeline whose rows come from a server (F88–F91).
 *
 * @example
 * const table = remotePipeline({
 *   pageSize: 20,
 *   load: (query, signal) => api.get('orders', { json: query, signal }),
 * });
 * table.on('change', (view) => render(view));
 * table.setSearch('milan'); // one load; typing again aborts it and issues the next
 *
 * @template [Row=any]
 * @param {RemotePipelineOptions} options
 * @returns {object} `{view, setFilter, setSearch, toggleSort, setSort, setPage,
 *   setPageSize, batch, refresh, on, once, off, destroy}` — the `tablePipeline`
 *   vocabulary, plus `refresh()` and `destroy()`.
 * @throws {TypeError} On a malformed option, or an unknown one (ADR-0047).
 */
export function remotePipeline(options) {
  // No `= {}` default: `load` has no sensible one, so an empty bag is a caller
  // error and saying so beats destructuring `undefined`.
  if (options === null || typeof options !== 'object') {
    throw new TypeError('remotePipeline: options must be an object with a `load` function');
  }
  const {
    load,
    columns,
    pageSize: initialPageSize,
    immediate = true,
    signal,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, 'remotePipeline');

  if (typeof load !== 'function') {
    throw new TypeError('remotePipeline: options.load must be a function');
  }
  if (typeof immediate !== 'boolean') {
    throw new TypeError('remotePipeline: options.immediate must be a boolean');
  }
  if (initialPageSize !== undefined) {
    assertPositiveInteger(initialPageSize, 'remotePipeline: options.pageSize');
  }
  if (signal !== undefined && (signal === null || typeof signal.addEventListener !== 'function')) {
    throw new TypeError('remotePipeline: options.signal must be an AbortSignal');
  }
  const declared = keySpace(columns);

  /** @type {Record<string, string>} */
  let filters = {};
  let search = '';
  /** @type {TableQuerySort[]} */
  let sort = [];
  let page = 1;
  /** @type {number | null} */
  let pageSize = initialPageSize ?? null;

  /** @type {any[]} */
  let rows = [];
  let total = 0;
  let loading = false;
  /** @type {unknown} */
  let error = null;

  /**
   * The in-flight load. `token` is compared at apply time — see {@link run}.
   * @type {{ token: object, controller: AbortController } | null}
   */
  let inFlight = null;
  /**
   * The most recently *issued* query, in-flight or settled. F89 compares against
   * this rather than against the in-flight one, so repeating a command after its
   * load finished does not re-ask the same question; `refresh()` is the way to
   * ask again on purpose.
   * @type {TableQuery | null}
   */
  let lastQuery = null;

  let destroyed = false;
  let depth = 0;
  let dirty = false;

  /** @type {EventEmitter<{ change: RemoteTableView<any> }>} */
  const emitter = new EventEmitter();

  /** @type {RemoteTableView<any> | null} */
  let cached = null;

  /**
   * @param {string} api
   * @returns {void}
   */
  function assertLive(api) {
    if (destroyed) throw new TypeError(`remotePipeline: ${api} was called after destroy()`);
  }

  /**
   * @param {unknown} key
   * @returns {string}
   */
  function assertKey(key) {
    if (typeof key !== 'string' || key === '') {
      throw new TypeError('remotePipeline: key must be a non-empty string');
    }
    if (declared !== null && !declared.has(key)) {
      throw new TypeError(`remotePipeline: unknown column '${key}'`);
    }
    return key;
  }

  /** @returns {TableState} */
  function state() {
    return { filters, search, sort, page, pageSize };
  }

  /** @returns {RemoteTableView<any>} */
  function view() {
    if (cached !== null) return cached;
    const query = tableQuery(state());
    cached = {
      rows,
      total,
      page,
      pageCount: pageSize === null ? 1 : Math.max(1, Math.ceil(total / pageSize)),
      sort: query.sort,
      filters: query.filters,
      search,
      pageSize,
      loading,
      error,
      query,
    };
    return cached;
  }

  /** @returns {void} */
  function announce() {
    cached = null;
    emitter.emit('change', view());
  }

  /**
   * Settle one load, if it is still the current one.
   *
   * The identity check is the load-bearing part of F89: `AbortSignal` stops a
   * `fetch`, but it cannot un-resolve a promise that already settled in a
   * microtask, so "we aborted it" is not the same as "it cannot arrive".
   *
   * @param {object} token
   * @param {() => void} apply
   * @returns {void}
   */
  function settle(token, apply) {
    if (destroyed || inFlight === null || inFlight.token !== token) return;
    inFlight = null;
    loading = false;
    apply();
    announce();
  }

  /**
   * Issue a load for the current state, honouring the F89 race rules.
   *
   * @param {boolean} force - `refresh()` reloads even when the query is unchanged.
   * @returns {void}
   */
  function run(force) {
    const query = tableQuery(state());
    if (!force && lastQuery !== null && sameQuery(lastQuery, query)) return;

    // The losing request is aborted, not merely ignored: discarding a response
    // still costs the server the work that produced it.
    if (inFlight !== null) inFlight.controller.abort();

    const controller = new AbortController();
    const token = {};
    inFlight = { token, controller };
    lastQuery = query;
    loading = true;
    announce();

    /** @param {unknown} failure */
    const fail = (failure) => {
      // An abort is not a failure — it is this pipeline's own doing, and it must
      // leave no error behind for the next render to show.
      if (controller.signal.aborted) return;
      settle(token, () => {
        // Previous rows stay: an error banner over stale data is recoverable, an
        // empty table that does not say why is not (F91).
        error = failure;
      });
    };

    // Called synchronously, not on a microtask: the request must be observable —
    // and abortable — the moment the command that caused it returns.
    let pending;
    try {
      pending = load(query, controller.signal);
    } catch (failure) {
      fail(failure);
      return;
    }

    // `Promise.resolve` accepts a plain value too, so a synchronous source is a
    // source like any other (F88).
    Promise.resolve(pending).then(
      (result) =>
        settle(token, () => {
          // A malformed result is this load's failure, not a throw into a promise
          // nobody is holding — it lands in `error` like any other.
          try {
            const next = readResult(result);
            rows = next.rows;
            total = next.total;
            error = null;
          } catch (failure) {
            error = failure;
          }
        }),
      fail,
    );
  }

  /**
   * Apply a state change, then load — both deferred to the outermost `batch`.
   *
   * @param {() => void} mutate
   * @returns {void}
   */
  function commit(mutate) {
    mutate();
    cached = null;
    if (depth > 0) {
      dirty = true;
      return;
    }
    run(false);
  }

  const api = {
    view,

    /**
     * @param {string} key
     * @param {string | null} filter
     */
    setFilter(key, filter) {
      assertLive('setFilter');
      const resolved = assertKey(key);
      if (filter !== null && filter !== undefined && typeof filter !== 'string') {
        throw new TypeError(
          `remotePipeline: setFilter('${resolved}', …) takes a string or null — a predicate cannot be sent to a server`,
        );
      }
      commit(() => {
        if (filter === null || filter === undefined || filter === '') delete filters[resolved];
        else filters[resolved] = filter;
        page = 1;
      });
    },

    /** @param {string} text */
    setSearch(text) {
      assertLive('setSearch');
      if (typeof text !== 'string') {
        throw new TypeError('remotePipeline: setSearch(text) requires a string');
      }
      commit(() => {
        search = text;
        page = 1;
      });
    },

    /** @param {string} key */
    toggleSort(key) {
      assertLive('toggleSort');
      const resolved = assertKey(key);
      commit(() => {
        const current = sort.find((entry) => entry.key === resolved);
        if (current === undefined) sort = [{ key: resolved, direction: 'asc' }];
        else if (current.direction === 'asc') sort = [{ key: resolved, direction: 'desc' }];
        else sort = [];
        page = 1;
      });
    },

    /** @param {readonly TableQuerySort[]} entries */
    setSort(entries) {
      assertLive('setSort');
      if (!Array.isArray(entries)) {
        throw new TypeError('remotePipeline: setSort(entries) requires an array');
      }
      const next = entries.map((entry) => {
        if (entry === null || typeof entry !== 'object') {
          throw new TypeError('remotePipeline: every sort entry must be an object');
        }
        const resolved = assertKey(entry.key);
        if (entry.direction !== 'asc' && entry.direction !== 'desc') {
          throw new TypeError(
            `remotePipeline: sort direction for '${resolved}' must be 'asc' or 'desc'`,
          );
        }
        return { key: resolved, direction: entry.direction };
      });
      commit(() => {
        sort = next;
        page = 1;
      });
    },

    /** @param {number} next */
    setPage(next) {
      assertLive('setPage');
      assertPositiveInteger(next, 'remotePipeline: setPage(page)');
      commit(() => {
        page = next;
      });
    },

    /** @param {number | null} next */
    setPageSize(next) {
      assertLive('setPageSize');
      if (next !== null) assertPositiveInteger(next, 'remotePipeline: setPageSize(pageSize)');
      commit(() => {
        pageSize = next;
        page = 1;
      });
    },

    /** @param {() => void} fn */
    batch(fn) {
      assertLive('batch');
      if (typeof fn !== 'function') {
        throw new TypeError('remotePipeline: batch(fn) requires a function');
      }
      depth += 1;
      try {
        fn();
      } finally {
        depth -= 1;
      }
      if (depth === 0 && dirty) {
        dirty = false;
        run(false);
      }
    },

    /**
     * Reload the current query, unconditionally — the way to retry after a
     * failure, and the reason F89's coalescing is safe to have.
     */
    refresh() {
      assertLive('refresh');
      run(true);
    },

    /**
     * @param {'change'} event
     * @param {(view: RemoteTableView<any>) => void} listener
     */
    on: (event, listener) => emitter.on(event, listener),
    /**
     * @param {'change'} event
     * @param {(view: RemoteTableView<any>) => void} listener
     */
    once: (event, listener) => emitter.once(event, listener),
    /**
     * @param {'change'} event
     * @param {(view: RemoteTableView<any>) => void} listener
     */
    off: (event, listener) => emitter.off(event, listener),

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (inFlight !== null) inFlight.controller.abort();
      inFlight = null;
      loading = false;
      cached = null;
      if (signal !== undefined) signal.removeEventListener('abort', api.destroy);
    },
  };

  if (signal !== undefined) {
    if (signal.aborted) destroyed = true;
    else signal.addEventListener('abort', api.destroy);
  }

  if (immediate && !destroyed) run(false);

  return api;
}
