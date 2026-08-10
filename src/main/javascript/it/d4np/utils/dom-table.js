/**
 * egl-utils-js — the bridge between a table pipeline and its DOM controls
 * (spec 03 §2 item F51; stateful, browser-leaning).
 *
 * This is the only file in the library that knows about both halves of the
 * tabular feature, and it is deliberately thin. The pipeline (F42) owns state
 * and derivation and never touches a document; this binding owns listeners and
 * attribute writes and never owns state. It talks to the pipeline exclusively
 * through public commands and the `'change'` event, which is why the same
 * pipeline instance can derive page 1 during a server render and then be adopted
 * by the browser without knowing it happened.
 *
 * Two consequences worth stating plainly:
 *
 * - **Row rendering stays the caller's.** The binding wires controls, never
 *   cells. Rows are rendered in the caller's own `'change'` subscriber, and row
 *   behaviour is attached with one {@link delegate} listener that survives every
 *   re-render — the same reason the sort headers are delegated here.
 * - **Teardown is structural.** One internal `AbortController` detaches every
 *   listener, cancels every pending debounce, and unsubscribes from the
 *   pipeline, so nothing can fire into a dead binding (NFR-15).
 *
 * @module egl-utils-js/dom
 */

import { debounce } from './events.js';
import { delegate, setEnabled } from './dom-events.js';
import { controllerFor, isElement, requireDocument } from './dom-helpers.js';
import { DomContractError } from './errors.js';
import { assertNoUnknownOptions } from './option-keys.js';

/** Commands each binding needs, so a wrong object fails at bind time. */
const REQUIRED_COMMAND = /** @type {const} */ ({
  filters: 'setFilter',
  search: 'setSearch',
  sortHeaders: 'toggleSort',
  pagination: 'setPage',
  pageSize: 'setPageSize',
});

/**
 * The default page indicator: digits and a separator, no words.
 *
 * Language-neutral on purpose — a default that said "Page 1 of 4" would ship an
 * English string into every consumer's UI. Callers who want words pass
 * `formatStatus`.
 *
 * @param {{ page: number, pageCount: number }} view
 * @returns {string}
 */
const defaultStatus = (view) => `${view.page} / ${view.pageCount}`;

/** @param {unknown} value @param {string} name @returns {asserts value is string} */
function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

/**
 * Read the sort key a header carries.
 *
 * `data-sort-key` is the convention, and the same attribute the selector in
 * `sortHeaders.selector` usually matches on — so the markup states once, in one
 * place, which columns are sortable and under which key.
 *
 * @param {Element} el
 * @returns {string} The key, or `''` when the header declares none.
 */
function sortKeyOf(el) {
  return el.getAttribute('data-sort-key') ?? '';
}

/**
 * @typedef {object} TableBindings
 * @property {Record<string, string | Element>} [filters] - Column key to the
 *   input that filters it. Each input's value is debounced into
 *   `setFilter(key, value)`.
 * @property {string | Element} [search] - The global search input, debounced
 *   into `setSearch(value)`.
 * @property {{ root: string | Element, selector: string }} [sortHeaders] - A
 *   container and the selector matching its sortable headers. **One** delegated
 *   listener is attached to the container, so headers may be re-rendered freely;
 *   each header's column comes from its `data-sort-key` attribute, and each
 *   receives `aria-sort` on every change.
 * @property {{ prev?: string | Element, next?: string | Element, status?: string | Element }} [pagination] - Previous
 *   and next controls, enabled or disabled from the derived view, and an
 *   optional element whose `textContent` shows the position.
 * @property {string | Element} [pageSize] - A control whose value sets the page
 *   size. A blank or non-positive value stops paginating, so an "All" option is
 *   just `<option value="">`.
 */

/**
 * @typedef {object} BindTableControlsOptions
 * @property {AbortSignal} [signal] - Aborting it tears the binding down, exactly
 *   as calling the returned function does.
 * @property {number} [debounceMs=200] - Quiet period for the filter and search
 *   inputs. `0` binds them undebounced.
 * @property {Element | Document | DocumentFragment} [root=document] - The node
 *   selectors resolve against. Passing one explicitly is what makes this
 *   function usable inside an iframe or a server-side DOM implementation, since
 *   no ambient document is then needed (NFR-14).
 * @property {(view: any) => string} [formatStatus] - Renders the pagination
 *   status text. Defaults to `'1 / 4'` — digits only, so no language is
 *   assumed.
 */

/**
 * Wire DOM controls to a table pipeline, and reflect its state back (F51).
 *
 * Every control drives the pipeline through a public command, and every change
 * flows back through the one `'change'` subscription: sort headers get
 * `aria-sort`, pagination controls are enabled or disabled from the derived
 * view, and the status element is rewritten. Filter and search inputs are
 * deliberately **one-way** — writing a value back into an input the user is
 * typing in is how a control fights its own user.
 *
 * A selector that matches nothing is an error, not a silent skip: passing a
 * selector asserts the control exists, and a typo that quietly disables a filter
 * box is the failure this fails fast to prevent (ADR-0028). Controls a table
 * genuinely lacks are simply left out of `bindings`.
 *
 * @example
 * const unbind = bindTableControls(table, {
 *   filters: { name: '#f-name', status: '#f-status' },
 *   search: '#q',
 *   sortHeaders: { root: 'thead', selector: 'th[data-sort-key]' },
 *   pagination: { prev: '#prev', next: '#next', status: '#page' },
 *   pageSize: '#page-size',
 * });
 *
 * // Rows stay yours — and one delegated listener outlives every re-render:
 * table.on('change', (view) => renderRows(tbody, view.rows));
 * delegate(tbody, 'click', 'tr[data-id]', (event, row) => open(row.dataset.id));
 *
 * unbind(); // or abort the signal you passed
 *
 * @example
 * // Words instead of digits, and a shorter quiet period:
 * bindTableControls(table, bindings, {
 *   debounceMs: 100,
 *   formatStatus: (view) => `Pagina ${view.page} di ${view.pageCount}`,
 * });
 *
 * @param {import('./table.js').TablePipeline<any>} pipeline - The F42 pipeline
 *   to drive. Only its public commands and `'change'` event are used.
 * @param {TableBindings} bindings
 * @param {BindTableControlsOptions} [options]
 * @returns {() => void} Idempotent teardown: detaches every listener, cancels
 *   every pending debounce, and unsubscribes from the pipeline.
 * @throws {TypeError} If `pipeline` lacks a command a given binding needs, if
 *   `bindings` is not an object, or if an option has the wrong type.
 * @throws {DomContractError} If no `root` is given and there is no document, or
 *   if any selector matches nothing.
 */
export function bindTableControls(pipeline, bindings, options = {}) {
  if (pipeline === null || typeof pipeline !== 'object') {
    throw new TypeError('pipeline must be a table pipeline');
  }
  if (bindings === null || typeof bindings !== 'object') {
    throw new TypeError('bindings must be an object');
  }
  const {
    signal,
    debounceMs = 200,
    root,
    formatStatus = defaultStatus,
    ...unknown
  } = options ?? {};
  assertNoUnknownOptions(unknown, 'bindTableControls');
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw new TypeError('options.debounceMs must be a number >= 0');
  }
  if (typeof formatStatus !== 'function') {
    throw new TypeError('options.formatStatus must be a function');
  }
  for (const [name, command] of Object.entries(REQUIRED_COMMAND)) {
    if (bindings[/** @type {keyof TableBindings} */ (name)] !== undefined) {
      if (typeof (/** @type {any} */ (pipeline)[command]) !== 'function') {
        throw new TypeError(`pipeline.${command}() is required to bind ${name}`);
      }
    }
  }
  if (typeof pipeline.on !== 'function' || typeof pipeline.view !== 'function') {
    throw new TypeError('pipeline must expose on() and view()');
  }

  const scope = root ?? requireDocument('bindTableControls');

  /** @type {string[]} Selectors that matched nothing, so one throw names them all. */
  const missing = [];

  /**
   * @param {string | Element} target
   * @param {string} label
   * @returns {Element | null}
   */
  const resolve = (target, label) => {
    if (isElement(target)) return /** @type {Element} */ (target);
    assertNonEmptyString(target, label);
    const found = /** @type {ParentNode} */ (scope).querySelector(/** @type {string} */ (target));
    if (found === null) missing.push(`${label} (${target})`);
    return found;
  };

  const { filters = {}, search, sortHeaders, pagination = {}, pageSize } = bindings;

  // Resolve everything before attaching anything, so a partly-wired table is
  // never left behind by a throw halfway through.
  const filterEntries = Object.entries(filters).map(
    ([key, target]) => /** @type {const} */ ([key, resolve(target, `filters.${key}`)]),
  );
  const searchEl = search === undefined ? null : resolve(search, 'search');
  const headerRoot =
    sortHeaders === undefined ? null : resolve(sortHeaders.root, 'sortHeaders.root');
  const prevEl = pagination.prev === undefined ? null : resolve(pagination.prev, 'pagination.prev');
  const nextEl = pagination.next === undefined ? null : resolve(pagination.next, 'pagination.next');
  const statusEl =
    pagination.status === undefined ? null : resolve(pagination.status, 'pagination.status');
  const pageSizeEl = pageSize === undefined ? null : resolve(pageSize, 'pageSize');

  if (missing.length > 0) {
    throw new DomContractError(
      `bindTableControls found no element for: ${missing.join(', ')}. ` +
        'A selector asserts the control exists — omit the binding for controls this table does not have.',
    );
  }

  const controller = controllerFor(root);
  const { signal: internal } = controller;
  /** @type {{ cancel: () => void }[]} */
  const pending = [];

  /**
   * Bind an input to a command, debounced unless the caller asked for none.
   *
   * @param {Element} el
   * @param {(value: string) => void} apply
   * @returns {void}
   */
  const bindInput = (el, apply) => {
    if (debounceMs > 0) {
      const run = debounce(apply, debounceMs);
      pending.push(run);
      el.addEventListener('input', () => run(/** @type {HTMLInputElement} */ (el).value), {
        signal: internal,
      });
      return;
    }
    el.addEventListener('input', () => apply(/** @type {HTMLInputElement} */ (el).value), {
      signal: internal,
    });
  };

  for (const [key, el] of filterEntries) {
    bindInput(/** @type {Element} */ (el), (value) => pipeline.setFilter(key, value));
  }
  if (searchEl !== null) {
    bindInput(searchEl, (value) => pipeline.setSearch(value));
  }

  if (headerRoot !== null && sortHeaders !== undefined) {
    delegate(
      headerRoot,
      'click',
      sortHeaders.selector,
      (_event, header) => {
        const key = sortKeyOf(header);
        if (key !== '') pipeline.toggleSort(key);
      },
      { signal: internal },
    );
  }

  if (prevEl !== null) {
    prevEl.addEventListener('click', () => pipeline.setPage(pipeline.view().page - 1), {
      signal: internal,
    });
  }
  if (nextEl !== null) {
    nextEl.addEventListener('click', () => pipeline.setPage(pipeline.view().page + 1), {
      signal: internal,
    });
  }
  if (pageSizeEl !== null) {
    pageSizeEl.addEventListener(
      'change',
      () => {
        const raw = Number(/** @type {HTMLInputElement} */ (pageSizeEl).value);
        pipeline.setPageSize(Number.isInteger(raw) && raw > 0 ? raw : null);
      },
      { signal: internal },
    );
  }

  /**
   * Push the derived view back onto the controls.
   *
   * Headers are re-queried on every change rather than captured once: the caller
   * owns rendering and may replace the whole `thead`, and a stale node list
   * would silently stop receiving `aria-sort`.
   *
   * @param {any} view
   * @returns {void}
   */
  const reflect = (view) => {
    if (headerRoot !== null && sortHeaders !== undefined) {
      const entries = new Map(view.sort.map((/** @type {any} */ e) => [e.key, e.direction]));
      for (const header of headerRoot.querySelectorAll(sortHeaders.selector)) {
        const direction = entries.get(sortKeyOf(header));
        header.setAttribute(
          'aria-sort',
          direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none',
        );
      }
    }
    setEnabled(prevEl, view.page > 1);
    setEnabled(nextEl, view.page < view.pageCount);
    if (statusEl !== null) statusEl.textContent = formatStatus(view);
  };

  const unsubscribe = pipeline.on('change', reflect);

  internal.addEventListener(
    'abort',
    () => {
      unsubscribe();
      // Cancel before the listeners are gone rather than after: a debounce that
      // fires post-teardown would command a pipeline this binding no longer
      // reflects, which is the trailing-callback failure NFR-15 forbids.
      for (const debounced of pending) debounced.cancel();
    },
    { once: true },
  );

  if (signal !== undefined) {
    if (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean') {
      controller.abort();
      throw new TypeError('options.signal must be an AbortSignal');
    }
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  reflect(pipeline.view());

  return () => controller.abort();
}
