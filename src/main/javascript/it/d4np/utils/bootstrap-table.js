/**
 * egl-utils-js — the Bootstrap 5 table manager (spec 04 §2 item F66).
 *
 * The toolkit's flagship, and the place the whole arc pays off: a Bootstrap
 * table is markup plus class names, and everything underneath it — filtering,
 * sorting, pagination, one delegated listener, a derived read model — already
 * exists on the framework-agnostic entries. So this file **composes and
 * renders**; it owns no state of its own beyond the nodes it built (ADR-0039).
 *
 * Three properties follow from that, and they are the reasons to prefer this
 * over the hand-written table it replaces:
 *
 * 1. **The pipeline is public.** `table.pipeline` is the F42 instance, not a
 *    private field — an application that outgrows the facade drops one layer
 *    without rewriting its data flow, and one that already holds a pipeline
 *    (a server-rendered first page, a pipeline shared with a chart) passes it
 *    in. A facade that cannot be escaped is a trap, and this one has a door.
 * 2. **Cells cannot become markup.** Values reach the DOM through the F52
 *    content rules — `textContent` unless a `{ html, sanitize }` decision was
 *    made, and that decision is *per column*, so enriching one column does not
 *    open the other eleven (NFR-19).
 * 3. **Re-rendering rebinds nothing.** Row activation is one delegated listener
 *    above the `tbody` (F44), so a thousand re-renders attach zero listeners —
 *    the defect this toolkit exists to retire.
 *
 * The controls — filter row, search box, page-size select, pagination bar — are
 * F67 and arrive with roadmap 15.2, wired through F51 to the same pipeline this
 * file exposes.
 *
 * @module egl-utils-js/bootstrap
 */

import { isAbortSignal, isElement } from './dom-helpers.js';
import { tablePipeline } from './table.js';
import {
  appendContent,
  applyClasses,
  assertPlainObject,
  assertToken,
  closestWithin,
  isNode,
} from './bootstrap-elements.js';

/**
 * @typedef {import('./bootstrap-elements.js').Content} Content
 * @typedef {import('./bootstrap-elements.js').ClassOption} ClassOption
 */

/**
 * A column: what the pipeline derives on, and what the table renders.
 *
 * The F42 fields (`type`, `compare`, `getValue`, `searchable`, `filterable`)
 * are passed through to the pipeline untouched, so one declaration serves both
 * halves and the two cannot describe different columns.
 *
 * @template Row
 * @typedef {object} BsTableColumn
 * @property {string} key - The row property this column reads, and the name
 *   pipeline commands address it by.
 * @property {Content} [label] - Header content. Defaults to `key`, which is a
 *   developer-facing name — supply a label for anything a user reads (NFR-21).
 * @property {(value: unknown, row: Row) => Content} [format] - Turns the cell's
 *   value into content: a string (escaped), a node, or an array of either.
 *   **Required for any value that is not a primitive** — see
 *   {@link bsTable} on why a `Date` throws rather than rendering.
 * @property {'start' | 'center' | 'end'} [align] - Text alignment, applied to
 *   the header and the cells together so a numeric column stays aligned.
 * @property {ClassOption} [headerClass] - Extra classes for the `<th>`.
 * @property {ClassOption} [cellClass] - Extra classes for every `<td>`.
 * @property {boolean} [sortable] - Marks the header as a sort control:
 *   `data-sort-key` is stamped now and F67's bindings (roadmap 15.2) wire the
 *   click and the `aria-sort` reflection to it.
 * @property {boolean} [html] - Per-column opt-in to markup, overriding the
 *   table-level pair. Requires `sanitize` on the same column or the table.
 * @property {((html: string) => string) | false} [sanitize] - Per-column
 *   sanitizer, or `false` to declare this column's markup trusted.
 * @property {'auto' | 'string' | 'number' | 'date' | 'boolean'} [type] - F42:
 *   how to compare when sorting.
 * @property {(a: unknown, b: unknown, rowA: Row, rowB: Row) => number} [compare] - F42.
 * @property {(row: Row) => unknown} [getValue] - F42: the value to filter, sort
 *   **and render** — one extractor, so what the user sorts is what they see.
 * @property {boolean} [searchable] - F42.
 * @property {boolean} [filterable] - F42.
 */

/**
 * @template Row
 * @typedef {object} BsTableOptions
 * @property {readonly BsTableColumn<Row>[]} columns - Required: a table with no
 *   columns has nothing to render.
 * @property {readonly Row[]} [data=[]] - The rows. Mutually exclusive with
 *   `pipeline`.
 * @property {number} [pageSize] - Rows per page; omitted means no pagination.
 *   Mutually exclusive with `pipeline`.
 * @property {string | string[]} [locale] - Collation and numeric-operand locale
 *   for the pipeline. Mutually exclusive with `pipeline`.
 * @property {import('./table.js').TablePipeline<Row>} [pipeline] - An existing
 *   pipeline to render. The instance is **borrowed, not owned**: `destroy()`
 *   unsubscribes but leaves it running for whoever else holds it.
 * @property {string | ((row: Row, index: number) => string | number)} [rowKey] -
 *   A property name or an extractor; its value is stamped as `data-key` on each
 *   row, which is how an application finds its record from an event.
 * @property {(row: Row, event: Event) => void} [onRowClick] - Row activation,
 *   bound through **one** delegated listener and reachable from the keyboard.
 * @property {Content} [empty] - Rendered as a single full-width row when the
 *   derived view has none. Without it an empty table is simply empty.
 * @property {Content} [caption] - A `<caption>`; the table's accessible name.
 * @property {boolean} [captionTop=false] - Render the caption above the table
 *   (Bootstrap's `caption-top`) instead of below it.
 * @property {boolean} [striped=false]
 * @property {boolean} [stripedColumns=false]
 * @property {boolean} [hover=false]
 * @property {boolean} [bordered=false]
 * @property {boolean} [borderless=false]
 * @property {boolean} [small=false]
 * @property {string} [variant] - A `table-<variant>` colour, e.g. `'dark'`.
 * @property {boolean | string} [responsive=false] - Wrap in
 *   `table-responsive`, or `table-responsive-<breakpoint>` for a string.
 * @property {ClassOption} [class] - Extra classes for the `<table>`.
 * @property {boolean} [html] - Table-level markup opt-in; per column overrides.
 * @property {((html: string) => string) | false} [sanitize] - Table-level
 *   sanitizer.
 * @property {AbortSignal} [signal] - Aborting destroys the instance (NFR-15).
 */

/**
 * @template Row
 * @typedef {object} BsTableInstance
 * @property {Element} element - The node this instance owns inside the
 *   container, and the one `destroy()` removes: the `<table>`, or the
 *   responsive wrapper around it when `responsive` is set.
 * @property {Element} table - The `<table>` itself, which differs from
 *   `element` exactly when `responsive` is set.
 * @property {import('./table.js').TablePipeline<Row>} pipeline - The live F42
 *   instance. Commands issued on it re-render the table; nothing is hidden.
 * @property {(rows: readonly Row[]) => void} setData - Replace the row set —
 *   `pipeline.setSource` with the render already wired.
 * @property {() => void} destroy
 */

/** Alignment values, checked so a typo cannot ship a silently unaligned column. */
const ALIGNMENTS = /* @__PURE__ */ new Set(['start', 'center', 'end']);

/**
 * A complete Bootstrap table over an F42 pipeline (spec 04 F66).
 *
 * @example
 * const table = bsTable(container, {
 *   columns: [
 *     { key: 'host', label: 'Host', sortable: true },
 *     { key: 'ip', label: 'Address', sortable: true, align: 'end' },
 *     { key: 'seen', label: 'Last seen', type: 'date', format: (v) => v.toLocaleString('it') },
 *   ],
 *   data: hosts,
 *   pageSize: 25,
 *   striped: true,
 *   hover: true,
 *   responsive: true,
 *   empty: 'No hosts match these filters.',
 *   onRowClick: (row) => open(row.id),
 * });
 *
 * @example
 * // The pipeline is public: commands re-render the table, and the facade can
 * // be escaped without rewriting the data flow.
 * table.pipeline.setFilter('ip', '^192.168');
 * table.pipeline.toggleSort('seen');
 * table.pipeline.on('change', (view) => status.update(view));
 *
 * @example
 * // A rich cell opens *one* column, not the table (NFR-19).
 * { key: 'status', html: true, sanitize: sanitizeHtml, format: (v) => badgeMarkup(v) }
 * // …though returning a node needs no markup decision at all:
 * { key: 'status', format: (v) => bsBadge(v, { variant: v === 'up' ? 'success' : 'danger' }) }
 *
 * @template Row
 * @param {Element} container - Where the table is appended.
 * @param {BsTableOptions<Row>} options
 * @returns {BsTableInstance<Row>}
 * @throws {TypeError} On a malformed option, on a non-primitive cell value with
 *   no `format`, on `{ html: true }` without `sanitize`, on combining
 *   `pipeline` with the options that would build one, or on `setData()` after
 *   `destroy()`.
 * @throws {DomContractError} If there is nowhere to build the table.
 */
export function bsTable(container, options) {
  const api = 'bsTable';
  if (!isElement(container)) {
    throw new TypeError(`${api}: container must be an Element`);
  }
  assertPlainObject(options, 'options', api);

  const {
    columns,
    data,
    pageSize,
    locale,
    pipeline: injected,
    rowKey,
    onRowClick,
    empty,
    caption,
    captionTop = false,
    variant,
    responsive = false,
    signal,
  } = options;

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError(`${api}: options.columns must be a non-empty array`);
  }
  for (const [index, column] of columns.entries()) {
    assertPlainObject(column, `options.columns[${index}]`, api);
    if (typeof column.key !== 'string' || column.key === '') {
      throw new TypeError(`${api}: options.columns[${index}].key must be a non-empty string`);
    }
    if (column.format !== undefined && typeof column.format !== 'function') {
      throw new TypeError(`${api}: options.columns[${index}].format must be a function`);
    }
    if (column.align !== undefined && !ALIGNMENTS.has(column.align)) {
      throw new TypeError(`${api}: options.columns[${index}].align must be start, center, or end`);
    }
  }
  if (onRowClick !== undefined && typeof onRowClick !== 'function') {
    throw new TypeError(`${api}: options.onRowClick must be a function`);
  }
  if (rowKey !== undefined && typeof rowKey !== 'string' && typeof rowKey !== 'function') {
    throw new TypeError(`${api}: options.rowKey must be a string or a function`);
  }
  if (variant !== undefined) assertToken(variant, 'options.variant', api);
  if (typeof responsive === 'string') assertToken(responsive, 'options.responsive', api);
  if (signal !== undefined && !isAbortSignal(signal)) {
    throw new TypeError(`${api}: options.signal must be an AbortSignal`);
  }
  if (injected !== undefined) {
    // Silently ignoring construction options next to an injected instance would
    // mean a caller's `pageSize: 50` does nothing, visibly, with no explanation.
    for (const [name, value] of /** @type {[string, unknown][]} */ ([
      ['data', data],
      ['pageSize', pageSize],
      ['locale', locale],
    ])) {
      if (value !== undefined) {
        throw new TypeError(
          `${api}: options.${name} builds a pipeline, so it cannot be combined with ` +
            'options.pipeline — configure the injected instance instead',
        );
      }
    }
    if (typeof injected.view !== 'function' || typeof injected.on !== 'function') {
      throw new TypeError(`${api}: options.pipeline must be a tablePipeline instance`);
    }
  }

  // The container supplies the realm, so no `document` option is needed here:
  // an Element always has an ownerDocument (F65's reasoning).
  const doc = /** @type {Document} */ (container.ownerDocument);

  const pipeline =
    injected ??
    tablePipeline({
      source: data ?? [],
      columns: /** @type {readonly import('./table.js').TableColumn<Row>[]} */ (columns),
      ...(pageSize === undefined ? {} : { pageSize }),
      ...(locale === undefined ? {} : { locale }),
    });

  const table = doc.createElement('table');
  applyClasses(
    table,
    [
      'table',
      options.striped === true && 'table-striped',
      options.stripedColumns === true && 'table-striped-columns',
      options.hover === true && 'table-hover',
      options.bordered === true && 'table-bordered',
      options.borderless === true && 'table-borderless',
      options.small === true && 'table-sm',
      captionTop === true && 'caption-top',
      variant !== undefined && `table-${variant}`,
    ],
    options.class,
    api,
  );

  if (caption !== undefined) {
    const captionEl = doc.createElement('caption');
    appendContent(captionEl, caption, contentOptions(options, undefined), api);
    table.append(captionEl);
  }

  const thead = doc.createElement('thead');
  const tbody = doc.createElement('tbody');
  table.append(thead, tbody);

  /** @type {Element} */
  let element = table;
  if (responsive !== false) {
    element = doc.createElement('div');
    applyClasses(
      element,
      [typeof responsive === 'string' ? `table-responsive-${responsive}` : 'table-responsive'],
      undefined,
      api,
    );
    element.append(table);
  }

  // The header is built once: it depends on the columns, which are fixed for
  // the life of the instance. Only the body answers to the pipeline.
  const headRow = doc.createElement('tr');
  for (const column of columns) {
    const th = doc.createElement('th');
    th.setAttribute('scope', 'col');
    applyClasses(
      th,
      [column.align !== undefined && `text-${column.align}`],
      column.headerClass,
      api,
    );
    if (column.sortable === true) th.setAttribute('data-sort-key', column.key);
    // The **table's** content rules, never the column's: a column's
    // `{ html, sanitize }` describes its cells, and letting it also govern the
    // header would mean enriching a status column silently parses that column's
    // own label as markup — a door nobody asked to open. A rich header is a
    // `label` node, which needs no markup decision at all.
    appendContent(th, column.label ?? column.key, contentOptions(options, undefined), api);
    headRow.append(th);
  }
  thead.append(headRow);

  const controller = new AbortController();
  const interactive = onRowClick !== undefined;
  /** @type {readonly Row[]} */
  let rendered = [];

  /**
   * Rebuild the body from a derived view — one fragment, one insertion,
   * whatever the page size (F52).
   *
   * @param {import('./table.js').TableView<Row>} view
   * @returns {void}
   */
  const renderBody = (view) => {
    const fragment = doc.createDocumentFragment();
    rendered = view.rows;

    if (view.rows.length === 0) {
      if (empty !== undefined) {
        const tr = doc.createElement('tr');
        const td = doc.createElement('td');
        td.setAttribute('colspan', String(columns.length));
        appendContent(td, empty, contentOptions(options, undefined), api);
        tr.append(td);
        fragment.append(tr);
      }
    } else {
      for (const [index, row] of view.rows.entries()) {
        fragment.append(buildRow(row, index));
      }
    }
    tbody.replaceChildren(fragment);
  };

  /**
   * @param {Row} row
   * @param {number} index
   * @returns {Element}
   */
  const buildRow = (row, index) => {
    const tr = doc.createElement('tr');
    // The index is the delegation handle: an event carries a node, and this is
    // what turns that node back into the record it was rendered from.
    tr.setAttribute('data-egl-index', String(index));
    if (rowKey !== undefined) {
      const key =
        typeof rowKey === 'function'
          ? rowKey(row, index)
          : /** @type {Record<string, unknown>} */ (row)[rowKey];
      if (key !== undefined && key !== null) tr.setAttribute('data-key', String(key));
    }
    // A row that responds to a pointer and not to a keyboard is a control only
    // some users have (NFR-21). Where a row carries real actions, put a real
    // control in a cell instead — this covers the "open the record" case.
    if (interactive) tr.setAttribute('tabindex', '0');

    for (const column of columns) {
      const td = doc.createElement('td');
      applyClasses(
        td,
        [column.align !== undefined && `text-${column.align}`],
        column.cellClass,
        api,
      );
      const raw =
        column.getValue === undefined
          ? /** @type {Record<string, unknown>} */ (row)[column.key]
          : column.getValue(row);
      const content =
        column.format === undefined ? defaultCell(raw, column.key, api) : column.format(raw, row);
      appendContent(td, content, contentOptions(options, column), api);
      tr.append(td);
    }
    return tr;
  };

  if (interactive) {
    /**
     * @param {Event} event
     * @param {Element} rowEl
     * @returns {void}
     */
    const activate = (event, rowEl) => {
      const row = rendered[Number(rowEl.getAttribute('data-egl-index'))];
      // A foreign row someone appended into our tbody is not ours to act on.
      if (row === undefined) return;
      onRowClick(row, event);
    };

    /**
     * @param {Event} event
     * @returns {Element | null}
     */
    const ownRow = (event) => {
      const match = closestWithin(tbody, event, 'tr[data-egl-index]');
      // Direct children only: a table nested inside one of our cells carries
      // the same marker, and `closest` would hand us *its* index to look up in
      // *our* rows — silently the wrong record.
      return match !== null && match.parentElement === tbody ? match : null;
    };

    tbody.addEventListener(
      'click',
      (event) => {
        const rowEl = ownRow(event);
        if (rowEl === null) return;
        // A click on the row's own delete button is that button's click, not
        // the row's. Firing both is the classic double-action defect.
        const target = /** @type {{ closest?: (s: string) => Element | null } | null} */ (
          event.target
        );
        if (typeof target?.closest === 'function') {
          const control = target.closest(
            'a, button, input, select, textarea, label, [data-egl-no-row-click]',
          );
          if (control !== null && control !== rowEl && rowEl.contains(control)) return;
        }
        activate(event, rowEl);
      },
      { signal: controller.signal },
    );

    tbody.addEventListener(
      'keydown',
      (event) => {
        const key = /** @type {KeyboardEvent} */ (event).key;
        if (key !== 'Enter' && key !== ' ') return;
        const rowEl = ownRow(event);
        // Only when the row itself has focus — a key pressed inside a cell's
        // input belongs to that input.
        if (rowEl === null || event.target !== rowEl) return;
        event.preventDefault(); // Space would scroll the page.
        activate(event, rowEl);
      },
      { signal: controller.signal },
    );
  }

  renderBody(pipeline.view());
  const unsubscribe = pipeline.on('change', renderBody);
  container.append(element);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    controller.abort();
    unsubscribe();
    element.remove();
    // An injected pipeline is borrowed: unsubscribing is the whole of our
    // claim on it. One we built dies with us, having no timers to stop.
  };

  signal?.addEventListener('abort', destroy, { once: true });
  if (signal?.aborted === true) destroy();

  return {
    element,
    table,
    pipeline,
    setData: (rows) => {
      if (destroyed) throw new TypeError(`${api}: setData() was called after destroy()`);
      pipeline.setSource(rows);
    },
    destroy,
  };
}

/**
 * Render a cell that declared no `format`.
 *
 * Primitives read as themselves; nullish reads as blank, which is what an
 * absent value looks like in a table. Anything else **throws**, and that is the
 * deliberate part: `String(value)` would put `[object Object]` in a production
 * table, and a `Date` would render in whichever format the runtime's default
 * happens to be — a human-readable string the library chose, which NFR-21
 * reserves for the caller. Both are silent defects; a `TypeError` naming the
 * column is not.
 *
 * @param {unknown} value
 * @param {string} key
 * @param {string} api
 * @returns {Content}
 * @throws {TypeError} If the value needs a `format` the column did not declare.
 */
function defaultCell(value, key, api) {
  if (value === null || value === undefined) return '';
  const type = typeof value;
  if (type === 'string') return /** @type {string} */ (value);
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
  if (isNode(value)) return /** @type {Node} */ (value);
  throw new TypeError(
    `${api}: column "${key}" holds a ${value instanceof Date ? 'Date' : type} — declare a ` +
      'format(value, row) for it, so the rendered text is yours rather than the runtime default',
  );
}

/**
 * The content rules for one cell: the column's markup decision when it made
 * one, the table's otherwise.
 *
 * Per column rather than per table on purpose (NFR-19): enriching a status
 * column must not open the eleven columns beside it, which is exactly what a
 * single table-wide `html: true` would do.
 *
 * @template Row
 * @param {BsTableOptions<Row>} options
 * @param {BsTableColumn<Row> | undefined} column
 * @returns {import('./bootstrap-elements.js').ContentOptions}
 */
function contentOptions(options, column) {
  if (column === undefined || (column.html === undefined && column.sanitize === undefined)) {
    return { html: options.html, sanitize: options.sanitize };
  }
  return {
    html: column.html ?? options.html,
    sanitize: column.sanitize ?? options.sanitize,
  };
}
