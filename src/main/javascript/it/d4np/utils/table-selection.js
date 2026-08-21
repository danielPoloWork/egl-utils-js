/**
 * egl-utils-js — the row-selection model (spec 06 §2 item F94).
 *
 * A selection is **a set of row keys**, and that single sentence is the whole
 * design. Not a flag on each row: rows arrive from a server, get replaced
 * wholesale, and are never mutated by this library (F42), so a selection stored
 * on them is destroyed by every reload. Not an index: an index does not survive
 * a sort. Not an object reference: a reference does not survive a round-trip
 * through JSON. Keys survive all three, which is also what makes the memory cost
 * O(selected) rather than O(source) — an unselected 100,000-row table pays
 * nothing (NFR-27).
 *
 * **Owned beside the pipeline, never inside it.** Nothing here imports a
 * pipeline, subscribes to one, or knows what a filter is. Every operation that
 * needs rows is *given* rows, which is what lets one selection serve
 * `tablePipeline`, `remotePipeline`, or a caller with no pipeline at all — and
 * what keeps `tablePipeline` untouched (NFR-25).
 *
 * **The dangerous question is answered explicitly.** "Select all, then filter,
 * then act" has silently acted on invisible rows in every application that has
 * ever shipped it, so this module refuses to be vague about two things:
 *
 * - `selectAll(rows)` selects **exactly the rows it is handed** —
 *   for a table, the current page of the derived view. It never means "every row
 *   matching the filter" and never means "every row in the source".
 * - `stats(rows)` reports `offPage`: how many selected rows are
 *   *not* among the rows just passed. Under an active filter that includes rows
 *   the filter excludes. **That is the number a confirmation dialog has to
 *   show**, and it is reportable at any moment rather than being a thing the
 *   caller has to track.
 *
 * @module egl-utils-js/table
 */

import { EventEmitter } from './events.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * @typedef {object} TableSelectionChange
 * @property {readonly string[]} keys - The whole selection after the change, in
 *   insertion order.
 * @property {readonly string[]} added - Keys this change added.
 * @property {readonly string[]} removed - Keys this change removed.
 */

/**
 * @typedef {object} TableSelectionStats
 * @property {number} onPage - Selected rows among the rows just passed.
 * @property {number} offPage - Selected rows **not** among them: other pages,
 *   and — under an active filter — rows the filter excludes. The number an
 *   "apply to selection" confirmation is obliged to show.
 * @property {number} total - `onPage + offPage`; the whole selection.
 * @property {boolean} all - Every row passed is selected, and there was at least
 *   one. The header checkbox's checked state.
 * @property {boolean} some - Some but not all: the header checkbox's
 *   **indeterminate** state (F95).
 * @property {boolean} none - No row passed is selected.
 */

/**
 * @template [Row=any]
 * @typedef {object} TableSelectionOptions
 * @property {string | ((row: Row, index: number) => string | number)} rowKey - A
 *   property name or an extractor, the same vocabulary `bsTable` has carried
 *   since spec 04 F72. **Required, with no default**: identity and index are
 *   exactly the two things F94 forbids, so there is nothing sensible to fall back
 *   to and guessing would produce a selection that quietly breaks on the first
 *   sort.
 * @property {'single' | 'multiple'} [mode='multiple'] - `'single'` keeps at most
 *   one key: selecting replaces. Bulk operations are refused rather than
 *   reinterpreted — see `selectAll` below.
 * @property {readonly (string | number)[]} [initial] - Keys selected from the
 *   start, for restoring a selection from a URL, a server, or storage. Duplicates
 *   collapse; in `'single'` mode more than one distinct key is a `TypeError`,
 *   because silently keeping one of them would be a coin flip over the caller's
 *   data.
 */

/**
 * @template [Row=any]
 * @typedef {object} TableSelection
 * @property {'single' | 'multiple'} mode - The mode, readable so a renderer can
 *   draw radios or checkboxes without being told twice.
 * @property {(row: Row, index?: number) => string} keyOf - The key this
 *   selection uses for a row. Exposed because every caller that renders a row
 *   needs the same answer, and two implementations of one key rule is how a
 *   selection starts disagreeing with the markup.
 * @property {(row: Row, index?: number) => void} select
 * @property {(row: Row, index?: number) => void} deselect
 * @property {(row: Row, index?: number) => boolean} toggle - Returns the row's
 *   state *after* the toggle, which is what a checkbox handler wants.
 * @property {(rows: readonly Row[]) => void} selectAll - Selects exactly these
 *   rows. `'multiple'` only.
 * @property {(rows: readonly Row[]) => void} deselectAll - Deselects exactly
 *   these rows, leaving the rest of the selection alone.
 * @property {() => void} clear - Deselects everything.
 * @property {(rows: readonly Row[]) => void} prune - Drops selected keys that
 *   are **not** among `rows`. The explicit opt-out from the keep-by-default
 *   contract; see the note on {@link tableSelection}.
 * @property {(row: Row, index?: number) => boolean} isSelected
 * @property {(key: string | number) => boolean} hasKey - For code holding a key
 *   rather than a row — a `data-key` off a DOM event, typically.
 * @property {() => string[]} getSelection - The selected keys, insertion-ordered.
 *   A fresh array each call: the selection is not handed out by reference.
 * @property {() => number} count
 * @property {(rows: readonly Row[]) => TableSelectionStats} stats
 * @property {(event: 'change', listener: (change: TableSelectionChange) => void) => () => void} on - Subscribe;
 *   returns an unsubscribe function (F6).
 * @property {(event: 'change', listener: (change: TableSelectionChange) => void) => () => void} once
 * @property {(event: 'change', listener: (change: TableSelectionChange) => void) => void} off
 * @property {() => void} destroy
 */

/**
 * A keyed row selection (F94).
 *
 * **Rows that leave the source are kept, not pruned**, and this is the contract
 * rather than an implementation detail. A selection is the user's *intent*: they
 * ticked forty rows. Filtering, paging, or reloading changes what is on screen
 * and must not change what they asked to act on — pruning would mean "select
 * forty, narrow the filter, act" acted on eleven, silently, which is a data-loss
 * bug wearing the costume of a convenience. So the keys stay, `stats(rows)`
 * makes the invisible ones countable, and a caller who
 * genuinely wants the other policy — after a server-side delete, say — asks for
 * it by name with `prune(rows)`.
 *
 * Keys are compared **as strings**, so a `rowKey` returning `1` and one returning
 * `'1'` name the same row. That is deliberate: it is the same normalization
 * `bsTable` already applies when it stamps `data-key` on a row, and a selection
 * that disagreed with the DOM about what a key is would be worse than one that
 * conflates two types nobody mixes.
 *
 * @example
 * const rows = [{ id: 7, name: 'ada' }, { id: 9, name: 'bob' }];
 * const picked = tableSelection({ rowKey: 'id' });
 *
 * picked.select(rows[0]);
 * picked.getSelection();          // ['7']
 * picked.isSelected(rows[0]);     // true
 *
 * @example
 * // The page-vs-selection question, answered before acting:
 * const { onPage, offPage, total, some } = picked.stats(table.view().rows);
 * if (offPage > 0) confirm(`${total} selected, ${offPage} not shown`);
 *
 * @example
 * // Restored from somewhere, and observed like everything else in this library:
 * const picked = tableSelection({ rowKey: 'id', initial: params.getAll('sel') });
 * const off = picked.on('change', ({ keys }) => render(keys));
 *
 * @template [Row=any]
 * @param {TableSelectionOptions<Row>} options
 * @returns {TableSelection<Row>}
 * @throws {TypeError} If `rowKey` is missing or malformed, if `mode` is not one
 *   of the two, if `initial` is not an array of keys, if `initial` holds more
 *   than one distinct key in `'single'` mode, or on an unknown option key
 *   (ADR-0047).
 */
export function tableSelection(options) {
  const api = 'tableSelection';
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${api}: options must be an object with a rowKey`);
  }
  const { rowKey, mode = 'multiple', initial = [], ...unknown } = options;
  assertNoUnknownOptions(unknown, api);

  if (typeof rowKey !== 'string' && typeof rowKey !== 'function') {
    throw new TypeError(`${api}: options.rowKey must be a property name or a function`);
  }
  if (typeof rowKey === 'string' && rowKey === '') {
    throw new TypeError(`${api}: options.rowKey must be a non-empty property name`);
  }
  if (mode !== 'single' && mode !== 'multiple') {
    throw new TypeError(`${api}: options.mode must be 'single' or 'multiple'`);
  }
  if (!Array.isArray(initial)) {
    throw new TypeError(`${api}: options.initial must be an array of keys`);
  }

  /** @type {Set<string>} Insertion-ordered by construction, which is the API. */
  const selected = new Set();
  /** @type {EventEmitter<{ change: TableSelectionChange }>} */
  const emitter = new EventEmitter();
  let destroyed = false;

  /** @param {string} method @returns {void} */
  function assertLive(method) {
    if (destroyed) {
      throw new TypeError(`${api}: ${method}() was called after destroy()`);
    }
  }

  /**
   * @param {unknown} key
   * @param {string} where
   * @returns {string}
   */
  function normalize(key, where) {
    if (key === undefined || key === null) {
      throw new TypeError(
        `${api}: ${where} produced no key — a row without a key cannot be selected`,
      );
    }
    if (typeof key !== 'string' && typeof key !== 'number') {
      throw new TypeError(
        `${api}: ${where} produced a ${typeof key}; a key must be a string or a number`,
      );
    }
    return String(key);
  }

  for (const [index, key] of initial.entries()) {
    selected.add(normalize(key, `options.initial[${index}]`));
  }
  if (mode === 'single' && selected.size > 1) {
    throw new TypeError(
      `${api}: options.initial holds ${selected.size} distinct keys in 'single' mode — pass one, or use mode: 'multiple'`,
    );
  }

  /**
   * @param {Row} row
   * @param {number} [index=0]
   * @returns {string}
   */
  function keyOf(row, index = 0) {
    if (typeof rowKey === 'function') return normalize(rowKey(row, index), 'options.rowKey(row)');
    if (row === null || typeof row !== 'object') {
      throw new TypeError(`${api}: a row must be an object to read '${rowKey}' from it`);
    }
    return normalize(/** @type {Record<string, unknown>} */ (row)[rowKey], `row.${rowKey}`);
  }

  /**
   * Apply a mutation and announce it — once, with what actually changed.
   *
   * A no-op stays silent. That matters more here than it looks: a checkbox
   * handler that re-selects an already-selected row would otherwise emit, and a
   * renderer subscribed to `'change'` would redraw for nothing on every click.
   *
   * @param {(add: (key: string) => void, remove: (key: string) => void) => void} mutate
   * @returns {void}
   */
  function commit(mutate) {
    /** @type {string[]} */
    const added = [];
    /** @type {string[]} */
    const removed = [];
    mutate(
      (key) => {
        if (!selected.has(key)) {
          selected.add(key);
          added.push(key);
        }
      },
      (key) => {
        if (selected.delete(key)) removed.push(key);
      },
    );
    if (added.length === 0 && removed.length === 0) return;
    emitter.emit('change', {
      keys: [...selected],
      added,
      removed,
    });
  }

  /** @type {TableSelection<Row>} */
  const selection = {
    mode,
    keyOf,

    select(row, index) {
      assertLive('select');
      const key = keyOf(row, index);
      commit((add, remove) => {
        // Single mode replaces rather than accumulating, and the replacement is
        // one transaction: a listener never sees the empty moment between them.
        if (mode === 'single') for (const held of selected) if (held !== key) remove(held);
        add(key);
      });
    },

    deselect(row, index) {
      assertLive('deselect');
      const key = keyOf(row, index);
      commit((_add, remove) => remove(key));
    },

    toggle(row, index) {
      assertLive('toggle');
      const key = keyOf(row, index);
      const next = !selected.has(key);
      if (next) selection.select(row, index);
      else selection.deselect(row, index);
      return next;
    },

    selectAll(rows) {
      assertLive('selectAll');
      assertRows(rows, 'selectAll');
      if (mode === 'single') {
        throw new TypeError(
          `${api}: selectAll() is meaningless in 'single' mode — refusing rather than picking one of ${rows.length} rows`,
        );
      }
      commit((add) => {
        for (const [index, row] of rows.entries()) add(keyOf(row, index));
      });
    },

    deselectAll(rows) {
      assertLive('deselectAll');
      assertRows(rows, 'deselectAll');
      commit((_add, remove) => {
        for (const [index, row] of rows.entries()) remove(keyOf(row, index));
      });
    },

    clear() {
      assertLive('clear');
      commit((_add, remove) => {
        for (const key of [...selected]) remove(key);
      });
    },

    prune(rows) {
      assertLive('prune');
      assertRows(rows, 'prune');
      const present = new Set();
      for (const [index, row] of rows.entries()) present.add(keyOf(row, index));
      commit((_add, remove) => {
        for (const key of [...selected]) if (!present.has(key)) remove(key);
      });
    },

    isSelected(row, index) {
      return selected.has(keyOf(row, index));
    },

    hasKey(key) {
      return selected.has(normalize(key, 'hasKey(key)'));
    },

    getSelection() {
      return [...selected];
    },

    count() {
      return selected.size;
    },

    stats(rows) {
      assertRows(rows, 'stats');
      let onPage = 0;
      for (const [index, row] of rows.entries()) if (selected.has(keyOf(row, index))) onPage += 1;
      const total = selected.size;
      return {
        onPage,
        offPage: total - onPage,
        total,
        all: rows.length > 0 && onPage === rows.length,
        some: onPage > 0 && onPage < rows.length,
        none: onPage === 0,
      };
    },

    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),

    /**
     * Teardown. Emits **nothing**: clearing on the way out is not a selection
     * change anyone can act on, and announcing into listeners that are about to
     * be abandoned is noise. The flag is what makes it final — every command
     * after this throws, naming itself, the way `remotePipeline` does.
     */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      selected.clear();
    },
  };

  /**
   * @param {unknown} rows
   * @param {string} method
   * @returns {asserts rows is readonly Row[]}
   */
  function assertRows(rows, method) {
    if (!Array.isArray(rows)) {
      throw new TypeError(`${api}: ${method}(rows) requires an array of rows`);
    }
  }

  return selection;
}
