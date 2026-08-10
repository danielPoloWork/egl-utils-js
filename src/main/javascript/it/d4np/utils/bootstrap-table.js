/**
 * egl-utils-js — the Bootstrap 5 table manager (spec 04 §2 items F66-F67).
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
 * The controls (F67) hold the same line. A filter row, a search box, a page-size
 * select and a pagination bar are markup and accessible names here; the
 * debouncing, the `aria-sort` reflection and the teardown are F51
 * `bindTableControls`, the numbered pager is F65, and the filter expressions are
 * the F33 grammar the pipeline already compiles — custom `{operators}` included,
 * because the input hands its text to the pipeline rather than interpreting it
 * (ADR-0040).
 *
 * @module egl-utils-js/bootstrap
 */

import { controllerFor, isAbortSignal, isElement } from './dom-helpers.js';
import { assertNoUnknownOptions } from './option-keys.js';
import { bindTableControls } from './dom-table.js';
import { tablePipeline } from './table.js';
import { bsPagination } from './bootstrap-composites.js';
import {
  appendContent,
  applyClasses,
  assertPlainObject,
  assertToken,
  closestWithin,
  documentOf,
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
 * @property {BsTableControls<Row>} [controls] - Filter row, search box,
 *   page-size select and pagination bar, wired to the pipeline through F51
 *   (F67). Omitted, the table renders alone and the caller drives the pipeline.
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
 * @property {Document} [document] - Where the table is built, when it is not the
 *   container's own (F52).
 * @property {ClassOption} [class] - Extra classes for the `<table>`.
 * @property {boolean} [html] - Table-level markup opt-in; per column overrides.
 * @property {((html: string) => string) | false} [sanitize] - Table-level
 *   sanitizer.
 * @property {AbortSignal} [signal] - Aborting destroys the instance (NFR-15).
 */

/**
 * The control bands rendered around the table (F67). Every entry is `true` for
 * the defaults, an options object to configure it, or absent for "no such
 * control" — one rule for all of them.
 *
 * @template Row
 * @typedef {object} BsTableControls
 * @property {boolean | {label?: (column: BsTableColumn<Row>) => string, inputClass?: ClassOption, class?: ClassOption}} [filterRow] -
 *   A row of per-column filter inputs under the header, speaking the F33
 *   grammar — including any custom `{operators}` the pipeline was built with.
 *   A column with `filterable: false` gets an empty cell rather than a box the
 *   pipeline would reject. `label` names each input; the default is
 *   `Filter <column label>`.
 * @property {boolean | {label?: string, placeholder?: string, class?: ClassOption}} [search] -
 *   A global search input over the columns marked `searchable`.
 * @property {boolean | {options?: number[], allLabel?: string, label?: string, class?: ClassOption}} [pageSize] -
 *   A page-size select. `options` defaults to 10/25/50/100 and always includes
 *   the table's own `pageSize`; `allLabel` adds an unpaginated choice, and is
 *   required to get one because "All" is a word this library will not choose.
 * @property {boolean | {status?: boolean, statusClass?: ClassOption, siblingCount?: number, boundaryCount?: number, size?: string, labels?: object, class?: ClassOption}} [pagination] -
 *   An F65 pagination bar, plus a status element unless `status: false`.
 *   Remaining options pass through to {@link bsPagination}.
 * @property {Node} [toolbar] - A caller-rendered node placed in the header band.
 * @property {(view: import('./table.js').TableView<Row>) => string} [formatStatus] -
 *   The status text. Defaults to F51's language-neutral `'1 / 4'`.
 * @property {number} [debounceMs] - Quiet period for the filter and search
 *   inputs; F51's default is 200.
 * @property {ClassOption} [headerClass] - Extra classes for the header band.
 * @property {ClassOption} [footerClass] - Extra classes for the footer band.
 * @property {ClassOption} [class] - Extra classes for the wrapper.
 */

/**
 * The control elements, exposed for the same reason `.pipeline` is: a facade
 * that hides its own nodes forces callers to `querySelector` into its markup.
 *
 * @typedef {object} BsTableControlParts
 * @property {Record<string, Element>} filters - Column key to its filter input.
 * @property {Element} [search]
 * @property {Element} [pageSize]
 * @property {Element} [pagination] - The F65 bar's `<nav>`.
 * @property {Element} [status]
 */

/**
 * @template Row
 * @typedef {object} BsTableInstance
 * @property {Element} element - The node this instance owns inside the
 *   container, and the one `destroy()` removes: the `<table>`, the responsive
 *   wrapper around it when `responsive` is set, or the outer wrapper holding
 *   the control bands when `controls` are rendered.
 * @property {Element} table - The `<table>` itself, which differs from
 *   `element` whenever `responsive` or `controls` add a wrapper.
 * @property {BsTableControlParts} [controls] - The rendered control elements,
 *   present only when `options.controls` asked for some.
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
 * // With controls (F67): a filter row, a search box, a page-size select and a
 * // pagination bar, all driving the same pipeline through its public commands.
 * const table = bsTable(container, {
 *   columns,
 *   data: hosts,
 *   pageSize: 25,
 *   controls: {
 *     filterRow: true,        // each input speaks the F33 grammar: ^192.168, >2, =empty
 *     search: true,
 *     pageSize: { allLabel: 'All' },   // a word, so you supply it
 *     pagination: true,
 *     formatStatus: (view) => `Pagina ${view.page} di ${view.pageCount}`,
 *   },
 * });
 * table.controls.search.focus();   // the nodes are yours too
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
 * @throws {TypeError} On a malformed or unknown option, on a non-primitive cell value with
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
    controls,
    empty,
    caption,
    captionTop = false,
    variant,
    responsive = false,
    signal,
    striped = false,
    stripedColumns = false,
    hover = false,
    bordered = false,
    borderless = false,
    small = false,
    html,
    sanitize,
    class: extraClass,
    document: explicitDocument,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, api);

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
  // Container-first, `document` as an override (ADR-0049).
  const doc = documentOf(container, { document: explicitDocument }, api);

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
      striped === true && 'table-striped',
      stripedColumns === true && 'table-striped-columns',
      hover === true && 'table-hover',
      bordered === true && 'table-bordered',
      borderless === true && 'table-borderless',
      small === true && 'table-sm',
      captionTop === true && 'caption-top',
      variant !== undefined && `table-${variant}`,
    ],
    extraClass,
    api,
  );

  if (caption !== undefined) {
    const captionEl = doc.createElement('caption');
    appendContent(captionEl, caption, contentOptions({ html, sanitize }, undefined), api);
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
    appendContent(
      th,
      column.label ?? column.key,
      contentOptions({ html, sanitize }, undefined),
      api,
    );
    headRow.append(th);
  }
  thead.append(headRow);

  const controller = controllerFor(container);
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
        appendContent(td, empty, contentOptions({ html, sanitize }, undefined), api);
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
      appendContent(td, content, contentOptions({ html, sanitize }, column), api);
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

  // Controls wrap the table rather than reaching into it: `element` stays "the
  // node this instance owns", which is now the wrapper (F66/F67, ADR-0040).
  const wired =
    controls === undefined
      ? null
      : buildControls({
          controls,
          columns,
          pipeline,
          doc,
          table: element,
          thead,
          pageSize,
          api,
        });
  if (wired !== null) element = wired.element;

  renderBody(pipeline.view());
  const unsubscribe = pipeline.on('change', (view) => {
    renderBody(view);
    // The pager rides the subscription the body already needs: one 'change'
    // listener for everything this instance draws, rather than one per part.
    wired?.reflect(view);
  });
  container.append(element);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    controller.abort();
    unsubscribe();
    // One structural pass (NFR-15): the row delegation above, this instance's
    // subscription, then everything the controls own — F51's binding cancels
    // its own debounces and detaches its listeners, and the pager disposes its
    // delegated click.
    wired?.destroy();
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
    ...(wired === null ? {} : { controls: wired.parts }),
    setData: (rows) => {
      if (destroyed) throw new TypeError(`${api}: setData() was called after destroy()`);
      pipeline.setSource(rows);
    },
    destroy,
  };
}

/**
 * Build the control bands around a table and wire them to its pipeline (F67).
 *
 * Everything here is *composition*: the filter inputs speak the F33 grammar the
 * pipeline already compiles, the pager is F65 speaking the read model F42
 * already returns, and every wire is F51 `bindTableControls` — so this function
 * contributes markup and accessible names, and not one line of filtering,
 * debouncing, sorting or teardown logic (ADR-0040).
 *
 * @template Row
 * @param {{
 *   controls: BsTableControls<Row>,
 *   columns: readonly BsTableColumn<Row>[],
 *   pipeline: import('./table.js').TablePipeline<Row>,
 *   doc: Document,
 *   table: Element,
 *   thead: Element,
 *   pageSize: number | undefined,
 *   api: string,
 * }} context
 * @returns {{ element: Element, parts: BsTableControlParts, reflect: (view: any) => void, destroy: () => void }}
 * @throws {TypeError} On a malformed control option.
 */
function buildControls(context) {
  const { controls, columns, pipeline, doc, table, thead, pageSize, api } = context;
  assertPlainObject(controls, 'options.controls', api);
  const { filterRow, search, pageSize: pageSizeControl, pagination, toolbar } = controls;
  const { formatStatus, debounceMs, headerClass, footerClass } = controls;

  if (toolbar !== undefined && !isNode(toolbar)) {
    throw new TypeError(`${api}: options.controls.toolbar must be a Node`);
  }

  const wrapper = doc.createElement('div');
  applyClasses(wrapper, [], controls.class, api);

  const header = doc.createElement('div');
  applyClasses(
    header,
    ['d-flex', 'flex-wrap', 'justify-content-between', 'align-items-center', 'gap-2', 'mb-2'],
    headerClass,
    api,
  );
  const footer = doc.createElement('div');
  applyClasses(
    footer,
    ['d-flex', 'flex-wrap', 'justify-content-between', 'align-items-center', 'gap-2', 'mt-2'],
    footerClass,
    api,
  );

  /** @type {BsTableControlParts} */
  const parts = { filters: {} };
  /** @type {import('./dom-table.js').TableBindings} */
  const bindings = {};

  if (toolbar !== undefined) header.append(toolbar);

  if (search !== undefined && search !== false) {
    const options = search === true ? {} : opts(search, 'options.controls.search', api);
    const input = doc.createElement('input');
    input.setAttribute('type', 'search');
    // An accessible name has to be words, so — unlike a glyph — it cannot have a
    // language-neutral default. English, and injectable (the F57/F65 precedent).
    input.setAttribute('aria-label', options.label ?? 'Search');
    if (options.placeholder !== undefined) {
      input.setAttribute('placeholder', options.placeholder);
    }
    applyClasses(input, ['form-control', 'form-control-sm', 'w-auto'], options.class, api);
    header.append(input);
    bindings.search = input;
    parts.search = input;
  }

  if (pageSizeControl !== undefined && pageSizeControl !== false) {
    const options =
      pageSizeControl === true ? {} : opts(pageSizeControl, 'options.controls.pageSize', api);
    const select = doc.createElement('select');
    select.setAttribute('aria-label', options.label ?? 'Rows per page');
    applyClasses(select, ['form-select', 'form-select-sm', 'w-auto'], options.class, api);

    const sizes = options.options ?? DEFAULT_PAGE_SIZES;
    if (!Array.isArray(sizes) || sizes.some((n) => !Number.isInteger(n) || n <= 0)) {
      throw new TypeError(`${api}: options.controls.pageSize.options must be positive integers`);
    }
    // The instance's own page size belongs in the list, or the select opens
    // showing a value the table is not using.
    const values = [...new Set(pageSize === undefined ? sizes : [...sizes, pageSize])].sort(
      (a, b) => a - b,
    );
    for (const value of values) {
      const option = doc.createElement('option');
      option.setAttribute('value', String(value));
      // Digits need no translation, so the visible text carries no language.
      option.textContent = String(value);
      if (value === pageSize) option.setAttribute('selected', '');
      select.append(option);
    }
    if (options.allLabel !== undefined) {
      // Only on request: "All" is a word, and shipping one would put English in
      // every consumer's UI (NFR-21). An empty value stops paginating (F51).
      const option = doc.createElement('option');
      option.setAttribute('value', '');
      option.textContent = options.allLabel;
      if (pageSize === undefined) option.setAttribute('selected', '');
      select.append(option);
    }
    header.append(select);
    bindings.pageSize = select;
    parts.pageSize = select;
  }

  if (filterRow !== undefined && filterRow !== false) {
    const options = filterRow === true ? {} : opts(filterRow, 'options.controls.filterRow', api);
    if (options.label !== undefined && typeof options.label !== 'function') {
      throw new TypeError(`${api}: options.controls.filterRow.label must be a function`);
    }
    const row = doc.createElement('tr');
    applyClasses(row, [], options.class, api);
    /** @type {Record<string, Element>} */
    const filters = {};
    for (const column of columns) {
      // A cell, not a header: these are controls, and a <th> here would attach
      // itself to every data cell beneath as a header a screen reader announces.
      const cell = doc.createElement('td');
      // Only where the pipeline would accept one: a column that declared itself
      // unfiltered gets an empty cell rather than a box that throws on use.
      if (column.filterable !== false) {
        const input = doc.createElement('input');
        input.setAttribute('type', 'search');
        input.setAttribute(
          'aria-label',
          options.label === undefined ? `Filter ${labelText(column)}` : options.label(column),
        );
        applyClasses(input, ['form-control', 'form-control-sm'], options.inputClass, api);
        cell.append(input);
        filters[column.key] = input;
      }
      row.append(cell);
    }
    thead.append(row);
    bindings.filters = filters;
    parts.filters = filters;
  }

  if (columns.some((column) => column.sortable === true)) {
    // Scoped to our own thead, and matched on an attribute rather than a
    // descendant combinator — a selector like `'thead th'` would also match the
    // headers of a table nested in one of our cells.
    bindings.sortHeaders = { root: thead, selector: 'th[data-sort-key]' };
  }

  let pager = /** @type {import('./bootstrap-composites.js').BsPaginationInstance | null} */ (null);
  if (pagination !== undefined && pagination !== false) {
    // `status`/`statusClass` configure the band this function owns; everything
    // else is F65's own option bag. They are separated here rather than spread
    // wholesale, because `bsPagination` rejects a key it does not know
    // (ADR-0047) — and a control config is not a pager config.
    const {
      status: wantStatus = true,
      statusClass,
      ...pagerOptions
    } = pagination === true ? {} : opts(pagination, 'options.controls.pagination', api);
    if (wantStatus !== false) {
      const status = doc.createElement('span');
      applyClasses(status, ['text-body-secondary', 'small'], statusClass, api);
      footer.append(status);
      bindings.pagination = { status };
      parts.status = status;
    }
    // F65 owns prev/next *and* the numbered pages, so its bar is wired through
    // its own `onPage` rather than through F51's prev/next pair — passing both
    // would put two controls on one job.
    pager = bsPagination(footer, {
      ...pagerOptions,
      onPageChange: (/** @type {number} */ page) => pipeline.setPage(page),
    });
    parts.pagination = pager.element;
  }

  wrapper.append(header, table, footer);
  // A band nobody put anything in is a gap in the layout, not a container.
  if (header.childNodes.length === 0) header.remove();
  if (footer.childNodes.length === 0) footer.remove();

  const unbind = bindTableControls(pipeline, bindings, {
    // Explicitly scoped: `bindTableControls` resolves its root eagerly, so
    // without this a server-side render with no ambient document would fail
    // even though every binding here is already an element (NFR-20).
    root: wrapper,
    ...(debounceMs === undefined ? {} : { debounceMs }),
    ...(formatStatus === undefined ? {} : { formatStatus }),
  });

  // The pager starts on its own defaults (one page, page one), and F51's
  // reflection covers its own bindings and not this one — so without a first
  // call the bar would claim a single page until the first command arrived.
  pager?.setView(pipeline.view());

  return {
    element: wrapper,
    parts,
    reflect: (view) => pager?.setView(view),
    destroy: () => {
      unbind();
      pager?.destroy();
    },
  };
}

/** Page sizes offered when the caller names none — digits, so no language. */
const DEFAULT_PAGE_SIZES = /* @__PURE__ */ Object.freeze([10, 25, 50, 100]);

/**
 * Read a control's option object, rejecting anything that is not one.
 *
 * @template T
 * @param {T} value
 * @param {string} name
 * @param {string} api
 * @returns {T}
 * @throws {TypeError} If the value is not a plain object.
 */
function opts(value, name, api) {
  assertPlainObject(value, name, api);
  return value;
}

/**
 * A column's label as plain text, for an accessible name.
 *
 * @template Row
 * @param {BsTableColumn<Row>} column
 * @returns {string}
 */
function labelText(column) {
  const { label } = column;
  if (typeof label === 'string' && label !== '') return label;
  const text = isNode(label) ? /** @type {Node} */ (label).textContent : null;
  // An empty header is a layout choice, not a name: `aria-label="Filter "` tells
  // a screen-reader user nothing, so the key — developer-facing, but a name —
  // is the better answer.
  return text === null || text === '' ? column.key : text;
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
 * @param {import('./bootstrap-elements.js').ContentOptions} table - The
 *   table-level pair, as `bsTable` destructured it.
 * @param {BsTableColumn<Row> | undefined} column
 * @returns {import('./bootstrap-elements.js').ContentOptions}
 */
function contentOptions(table, column) {
  if (column === undefined || (column.html === undefined && column.sanitize === undefined)) {
    return table;
  }
  return {
    html: column.html ?? table.html,
    sanitize: column.sanitize ?? table.sanitize,
  };
}
