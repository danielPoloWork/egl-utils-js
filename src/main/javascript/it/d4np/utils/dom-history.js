/**
 * egl-utils-js — the bridge between a table pipeline and the address bar
 * (spec 06 §2 item F93; stateful, browser-leaning).
 *
 * The pure half of this feature is on `egl-utils-js/table`: `tableStateToParams`
 * and `tableStateFromParams` move a state between an object and a query string
 * and touch nothing else (NFR-29). This file is the half that is allowed to touch
 * the browser — read the real URL, write a history entry, listen for Back — and
 * it owns no state of its own, exactly as {@link bindTableControls} owns none.
 *
 * Three rules carry the whole design, and each is a bug avoided rather than a
 * feature added:
 *
 * - **A restore is one transaction, applied in one order.** F42's `batch` makes
 *   four commands emit one `'change'`; it does *not* stop `setFilter`, `setSearch`,
 *   `setSort` and `setPageSize` from each resetting the page to 1, because that
 *   reset is a state write, not an emission. So the page is applied **last**
 *   inside the batch. Batching alone would have landed every restore on page 1.
 * - **A restore must not write back.** Applying the URL fires `'change'`, and a
 *   change handler that writes the URL would push a history entry for the state it
 *   just read — and on `popstate`, an entry for the entry the user navigated to.
 *   Writing is suppressed for the duration of a restore.
 * - **The URL is untrusted, and the pipeline's key space is closed.** A pipeline
 *   declared with `columns` throws on an undeclared key, so applying a
 *   hand-edited `filter.bogus=1` blindly would take the page down. Each filter and
 *   each sort entry is applied on its own and the rejected ones are skipped —
 *   then the URL is rewritten to what was actually applied, so the bad parameter
 *   disappears instead of lingering as a lie.
 *
 * @module egl-utils-js/dom
 */

import { DomContractError } from './errors.js';
import { isAbortSignal } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';
import { tableStateFromParams, tableStateToParams } from './table-url.js';

/**
 * Commands a restore needs, so a wrong object fails at bind time rather than
 * halfway through the first restore.
 */
const REQUIRED = /** @type {const} */ ([
  'view',
  'on',
  'batch',
  'setFilter',
  'setSearch',
  'setSort',
  'setPage',
  'setPageSize',
]);

/**
 * @typedef {object} TableHistoryIgnored
 * @property {'filter' | 'sort' | 'hidden'} kind - Which part of the URL was refused.
 * @property {string} key - The column key the pipeline would not accept.
 * @property {unknown} reason - The error it threw, usually a `TypeError` naming
 *   the unknown or non-filterable column.
 */

/**
 * @typedef {object} BindTableHistoryOptions
 * @property {string} [prefix=''] - Passed straight through to the F92 pair, so
 *   two bindings on one page can namespace their parameters and leave each
 *   other's alone.
 * @property {'push' | 'replace'} [mode='push'] - How a change is written.
 *   `'push'` is the default because moving through table states with Back is the
 *   point of this binding (F93). The cost is real and worth knowing: every
 *   settled control change becomes a history entry, so a page whose filters are
 *   typed rather than chosen may prefer `'replace'` — the state stays addressable
 *   and shareable either way, it simply stops being a trail.
 * @property {(ignored: readonly TableHistoryIgnored[]) => void} [onIgnored] - Called
 *   after a restore that skipped something, with one entry per refused parameter.
 *   Absent, the skip is silent *and visible*: the following write removes the
 *   parameter from the URL, which is a better report than a console line nobody
 *   reads. Pass this when a page wants to say so out loud.
 * @property {{ getHiddenColumns: () => string[], showColumn: (key: string) => void, hideColumn: (key: string) => void, onColumnVisibility: (listener: () => void) => (() => void) }} [visibility] - The
 *   renderer whose column visibility joins the URL (F128/F129). A `bsTable`
 *   instance satisfies this shape, so the usual call is
 *   `bindTableHistory(table.pipeline, { visibility: table })`.
 *
 *   It is a **second object** rather than a field of the pipeline because
 *   visibility is not the pipeline's: a hidden column is a rendering fact, the
 *   derivation never learns about it, and a toggle therefore emits no `'change'`
 *   for this binding to ride. That is what the subscription is for. A URL naming
 *   a column this table does not have, or asking for every column at once, is
 *   refused one key at a time and reported through `onIgnored` — the same
 *   treatment a stale `filter.` parameter gets, for the same reason.
 * @property {{ history: History, location: Location, addEventListener: Function, removeEventListener: Function }} [window=globalThis] - The
 *   window to read the URL from, write history to, and listen for `popstate` on.
 *   Injectable for the same reason every DOM option on this entry is: a
 *   server-side DOM, an iframe, or a test needs a view that is not the ambient
 *   one (NFR-14). The same option name and shape as `sanitizeHtml({ window })`.
 * @property {AbortSignal} [signal] - Aborting it tears the binding down, exactly
 *   as calling the returned function does (NFR-15).
 */

/**
 * Keep a table pipeline and the address bar in step (F93).
 *
 * On bind it restores the state the URL describes, then normalizes the URL to
 * the state actually applied — with `replaceState`, so binding never adds a
 * history entry. After that, every `'change'` writes and every `popstate`
 * restores, which is what makes Back and Forward move through table states.
 *
 * Works with `tablePipeline` and `remotePipeline` alike: they share the command
 * vocabulary this binding speaks (ADR-0062), and for the remote one a restore is
 * one batch and therefore **one** request rather than four.
 *
 * @example
 * const table = tablePipeline({ source: rows, pageSize: 25, columns });
 * const unbind = bindTableHistory(table);
 * // ?q=ann&sort=score%3Adesc&page=3 is now the table's state, and the table's
 * // state is now the URL.
 *
 * @example
 * // Two tables, one page, no collisions — and no history trail:
 * bindTableHistory(orders, { prefix: 'orders', mode: 'replace' });
 * bindTableHistory(invoices, { prefix: 'invoices', mode: 'replace' });
 *
 * @example
 * // Column visibility in the URL too (F128), so a shared link shows the columns
 * // the sender was looking at — a `bsTable` instance already has the shape:
 * bindTableHistory(table.pipeline, { visibility: table });
 *
 * @example
 * // Say it out loud when a stale link names a column that no longer exists:
 * bindTableHistory(table, {
 *   onIgnored: (entries) => notify(`ignored: ${entries.map((e) => e.key).join(', ')}`),
 * });
 *
 * @param {import('./table.js').TablePipeline<any>} pipeline - The pipeline to
 *   bind. Only its public commands and its `'change'` event are used.
 * @param {BindTableHistoryOptions} [options]
 * @returns {() => void} Idempotent teardown: unsubscribes from the pipeline and
 *   detaches the `popstate` listener. The URL is left as it is — undoing a user's
 *   address bar on teardown would be a surprise, not a cleanup.
 * @throws {TypeError} If `pipeline` lacks a command a restore needs, if an option
 *   is malformed, or if the pipeline already holds a **function** filter, which
 *   has no URL representation (see `tableStateToParams`). That check runs *before*
 *   the first restore, because a restore clears every filter the URL does not
 *   name: checking afterwards would always pass, and the caller would silently
 *   lose the filter they set. Setting a predicate filter on an already-bound
 *   pipeline throws the same error out of the command that sets it, since the
 *   write happens in that command's `'change'`.
 * @throws {DomContractError} If the resolved window has no `history`, no
 *   `location`, or no `addEventListener` — this entry names its contract instead
 *   of failing on an undefined read (ADR-0028).
 */
export function bindTableHistory(pipeline, options = {}) {
  const api = 'bindTableHistory';
  if (pipeline === null || typeof pipeline !== 'object') {
    throw new TypeError(`${api}: pipeline must be a table pipeline`);
  }
  for (const command of REQUIRED) {
    if (typeof (/** @type {any} */ (pipeline)[command]) !== 'function') {
      throw new TypeError(`${api}: pipeline.${command}() is required`);
    }
  }
  const {
    prefix = '',
    mode = 'push',
    onIgnored,
    visibility,
    window: injected,
    signal,
    ...unknown
  } = options ?? {};
  assertNoUnknownOptions(unknown, api);
  if (typeof prefix !== 'string') throw new TypeError(`${api}: options.prefix must be a string`);
  if (mode !== 'push' && mode !== 'replace') {
    throw new TypeError(`${api}: options.mode must be 'push' or 'replace'`);
  }
  if (onIgnored !== undefined && typeof onIgnored !== 'function') {
    throw new TypeError(`${api}: options.onIgnored must be a function`);
  }
  if (visibility !== undefined) {
    // Named one by one, as the pipeline's own commands are above: "not a table"
    // is a worse report than "this object has no hideColumn()".
    for (const command of ['getHiddenColumns', 'showColumn', 'hideColumn', 'onColumnVisibility']) {
      if (typeof (/** @type {any} */ (visibility)[command]) !== 'function') {
        throw new TypeError(`${api}: options.visibility.${command}() is required`);
      }
    }
  }
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }

  const view = /** @type {any} */ (injected ?? globalThis);
  const history = view?.history;
  const location = view?.location;
  if (
    history === null ||
    typeof history !== 'object' ||
    typeof history.pushState !== 'function' ||
    typeof history.replaceState !== 'function' ||
    location === null ||
    typeof location !== 'object' ||
    typeof location.search !== 'string' ||
    typeof view.addEventListener !== 'function' ||
    typeof view.removeEventListener !== 'function'
  ) {
    throw new DomContractError(
      `${api}: no window with history and location — this binding needs an address bar, so pass options.window on a server or in a detached document`,
    );
  }

  /** Suppresses the write a restore's own `'change'` would otherwise trigger. */
  let restoring = false;
  let released = false;

  /**
   * Serialize the current state the way {@link write} will, so a comparison is
   * between two normalized strings rather than between one and whatever encoding
   * the address bar happens to carry.
   *
   * @returns {string}
   */
  function serialize() {
    const state = pipeline.view();
    return tableStateToParams(
      visibility === undefined ? state : { ...state, hidden: visibility.getHiddenColumns() },
      { prefix, base: location.search },
    );
  }

  /**
   * @param {'push' | 'replace'} how
   * @returns {void}
   */
  function write(how) {
    const next = serialize();
    // Normalized on both sides: `?a=1&a=2` and `?a=1&a=2` must compare equal even
    // when one of them arrived percent-encoded differently.
    const current = new URLSearchParams(
      location.search.startsWith('?') ? location.search.slice(1) : location.search,
    ).toString();
    if (next === current) return;
    const url = `${location.pathname}${next === '' ? '' : `?${next}`}${location.hash}`;
    // `history.state` is carried through rather than replaced with null: an
    // application may have stored its own state on this entry, and a table
    // changing page is no reason to lose it.
    if (how === 'push') history.pushState(history.state, '', url);
    else history.replaceState(history.state, '', url);
  }

  /**
   * Apply the URL to the pipeline as one transaction (F93).
   *
   * @returns {void}
   */
  function restore() {
    const target = tableStateFromParams(location.search, { prefix });
    /** @type {TableHistoryIgnored[]} */
    const ignored = [];

    restoring = true;
    try {
      // Outside the batch, and before it: visibility is not a pipeline command —
      // the derivation never learns about it — so there is nothing here for
      // `batch` to coalesce. Applied first so a refused filter below cannot leave
      // the table showing columns the URL did not describe.
      if (visibility !== undefined) {
        const want = new Set(target.hidden);
        for (const key of visibility.getHiddenColumns()) {
          // Unguarded, like the filter clearing below and for the same reason:
          // this key came out of the table's own answer a line ago.
          if (!want.has(key)) visibility.showColumn(key);
        }
        for (const key of want) {
          try {
            visibility.hideColumn(key);
          } catch (reason) {
            ignored.push({ kind: 'hidden', key, reason });
          }
        }
      }
      pipeline.batch(() => {
        // Clearing first, so a filter the URL no longer carries actually goes:
        // a restore describes the whole state, not a patch on the current one.
        for (const key of Object.keys(pipeline.view().filters)) {
          // Unguarded, unlike the loop below: this key came out of the
          // pipeline's own view a line ago, so clearing it cannot legitimately
          // fail, and a `try` here would only hide a broken pipeline. The
          // untrusted half is what the URL supplies, and that is where the guard
          // is.
          if (!Object.hasOwn(target.filters, key)) pipeline.setFilter(key, null);
        }
        for (const [key, value] of Object.entries(target.filters)) {
          try {
            pipeline.setFilter(key, value);
          } catch (reason) {
            ignored.push({ kind: 'filter', key, reason });
          }
        }

        pipeline.setSearch(target.search);

        // Built up one entry at a time because `setSort` takes the whole array
        // and rejects it whole: one stale column key would otherwise discard the
        // sort around it. Each attempt is validated before it commits, so a
        // refused entry leaves the accepted ones standing.
        pipeline.setSort([]);
        /** @type {{ key: string, direction: 'asc' | 'desc' }[]} */
        const accepted = [];
        for (const entry of target.sort) {
          try {
            pipeline.setSort([...accepted, entry]);
            accepted.push(entry);
          } catch (reason) {
            ignored.push({ kind: 'sort', key: entry.key, reason });
          }
        }

        pipeline.setPageSize(target.pageSize);
        // Last, and this ordering is the requirement: every command above resets
        // the page to 1 as part of its own commit, so a page restored before them
        // would be silently overwritten inside the same batch.
        pipeline.setPage(target.page);
      });
    } finally {
      restoring = false;
    }

    if (ignored.length > 0 && onIgnored !== undefined) onIgnored(ignored);
  }

  // Before restoring, not after: a restore clears every filter the URL does not
  // name, so by then a predicate would be gone and the caller would never learn
  // their filter had been dropped. Serializing the state as it stands is what
  // turns that silent loss into a refusal naming the column.
  tableStateToParams(pipeline.view(), { prefix });

  restore();
  // Normalize the URL to what was actually applied — a malformed parameter, or one
  // naming a column that no longer exists, disappears here rather than lingering
  // as a description of a table that is not on screen. Always `replaceState`:
  // binding a table is not a navigation.
  write('replace');

  const onPopState = () => {
    if (!released) restore();
  };
  view.addEventListener('popstate', onPopState);

  const unsubscribe = pipeline.on('change', () => {
    if (!restoring && !released) write(mode);
  });
  // Its own subscription, because a visibility change is not a pipeline change:
  // without this a hidden column would only reach the URL on the next filter or
  // page the user happened to touch.
  const unsubscribeVisibility = visibility?.onColumnVisibility(() => {
    if (!restoring && !released) write(mode);
  });

  /** @returns {void} */
  function release() {
    if (released) return;
    released = true;
    unsubscribe();
    unsubscribeVisibility?.();
    view.removeEventListener('popstate', onPopState);
    if (signal !== undefined) signal.removeEventListener('abort', release);
  }

  if (signal !== undefined) {
    if (signal.aborted) release();
    else signal.addEventListener('abort', release);
  }

  return release;
}
