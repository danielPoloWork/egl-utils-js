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
import { tableSelection } from './table-selection.js';
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
  uniqueId,
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
 * @property {number} [width] - Starting width in **pixels** (F99). Only
 *   meaningful under `resize`, which is what makes a declared width
 *   authoritative; without it the browser lays the table out and this is inert.
 * @property {number} [minWidth] - The floor this column cannot go below,
 *   overriding `resize.min`. A date column and a checkbox column do not have the
 *   same sensible minimum, and one global number cannot say so.
 * @property {boolean} [resizable] - `false` exempts this column: no grip, and no
 *   width a user can change. Every column is resizable when `resize` is on.
 * @property {boolean} [movable] - `false` exempts this column from `reorder`: no
 *   handle, so a user cannot pick it up. `setColumnOrder` still places it, for the
 *   same reason `resizable: false` still takes a width — the exemption is from the
 *   user, not from the caller.
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
 * @property {boolean | BsTableStickyOptions} [sticky] - Opt-in sticky header
 *   (F98): the header row stays visible while the body scrolls. `position:
 *   sticky` and nothing else — **no scroll listener, no `requestAnimationFrame`,
 *   no layout measured in JavaScript**, which is what the requirement asks for
 *   and what makes this the cheapest option on this bag. `true` takes every
 *   default; `{ maxHeight }` also bounds the F71 wrapper so the body has something
 *   to scroll inside.
 * @property {boolean | BsTableResizeOptions<Row>} [resize] - Opt-in column
 *   resize (F99): a grip on every resizable header, driven by pointer **and by
 *   the keyboard**, with the widths readable and restorable so a caller can
 *   persist a layout. Widths live on a `<colgroup>`, so one resize writes one
 *   attribute per column and touches **no row** — a 10 000-row table costs
 *   exactly what a 10-row one does.
 * @property {boolean | BsTableReorderOptions<Row>} [reorder] - Opt-in column
 *   reorder (F100): a handle on every movable header, dragged with a pointer or
 *   stepped with the arrow keys, over an order that is **caller-visible and
 *   authoritative** — `getColumnOrder()` / `setColumnOrder()` mean a caller can
 *   build their own affordance, or restore a saved layout, without touching the
 *   DOM. Purely presentational: the F42 derivation never sees the order.
 * @property {boolean | BsTableSelectionOptions<Row>} [selection] - Opt-in row
 *   selection (F95): a leading column of checkboxes, a select-all header with a
 *   real **indeterminate** state, and `data-egl-selected` plus `table-active` on
 *   each selected row so CSS can style it without the caller re-rendering.
 *   `true` takes every default. **Requires `rowKey`** — a selection keyed by
 *   anything else breaks on the first sort (F94), so its absence is a `TypeError`
 *   rather than a fallback. Off by default: a table nobody selects in pays
 *   nothing (NFR-02).
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
 * @typedef {object} BsTableSelectionLabels
 * @property {string} [selectAll='Select all'] - Accessible name of the header
 *   control. English by default, like `bsCloseButton`'s `'Close'` and
 *   `bsSpinner`'s `'Loading…'`: a checkbox's purpose cannot be spelled in digits
 *   the way a page number can, so the default is a word and the word is
 *   injectable.
 * @property {string} [column='Select'] - Accessible name of the header cell in
 *   `'single'` mode, where there is no select-all control to name.
 * @property {(row: any, key: string) => string} [select] - Accessible name per
 *   row control. Defaults to the row's **key**, which is language-neutral and
 *   identifies the row — F95 forbids a name that is merely "checkbox", and a
 *   record id is a real name. Pass this to get a phrase.
 */

/**
 * @typedef {object} BsTableStickyOptions
 * @property {string} [top='0px'] - Where the header comes to rest, as a CSS length,
 *   relative to the scroll container. Non-zero for a table under something else
 *   that is already sticky inside the same container.
 * @property {string} [maxHeight] - A height for the scroll container, which is
 *   what makes the body scroll at all. Given, the F71 responsive wrapper becomes
 *   the scroll container and gets this height — so `{ responsive: true, sticky: {
 *   maxHeight: '400px' } }` is a working sticky table in one option. Omitted, the
 *   caller owns the container entirely and the header sticks to whichever
 *   scrolling ancestor they built. **Requires `responsive`**: without it there is
 *   no node of ours to put a height on, and quietly doing nothing is the failure
 *   this refuses.
 * @property {number} [zIndex=2] - Stacking order against the body cells. Raise it
 *   only against something else in the same container that overlaps.
 */

/**
 * @template Row
 * @typedef {object} BsTableResizeOptions
 * @property {number} [min=48] - The default floor, in pixels, for a column that
 *   declares no `minWidth`. A resize that can reach zero produces a column the
 *   user cannot find again, so there is no way to switch this off — only to
 *   choose the number.
 * @property {number} [step=16] - Pixels per arrow-key press, the keyboard
 *   counterpart of a drag. Shift multiplies it by four, which is the
 *   platform convention for every slider and the difference between a keyboard
 *   path that works and one that exists only on paper.
 * @property {number} [handle=8] - Width of the grip, in pixels. The default is
 *   a pointer target, not a hairline; a 1 px affordance is a 1 px miss.
 * @property {(column: BsTableColumn<Row>) => string} [label] - Accessible name
 *   for a column's grip. The default is `Resize <column label>`, which is
 *   English — supply this for any UI that is not (NFR-21).
 * @property {(widths: Record<string, number>, key: string) => void} [onResize] -
 *   Called once per **completed** change — a released drag, or one arrow-key
 *   press — with every column's width and the key of the one that moved. Once
 *   per commit rather than per pointer move, because this exists so a caller can
 *   persist a layout and persisting on every frame of a drag is a defect.
 */

/**
 * @template Row
 * @typedef {object} BsTableReorderOptions
 * @property {number} [handle=12] - Width of the drag handle, in pixels. It sits on
 *   the header's **leading** edge, where the F99 resize grip sits on the trailing
 *   one, so a table with both has one control per edge and no overlap.
 * @property {(column: BsTableColumn<Row>) => string} [label] - Accessible name for
 *   a column's handle. The default is `Move <column label>`, which is English —
 *   supply this for any UI that is not (NFR-21).
 * @property {(order: readonly string[], key: string) => void} [onReorder] - Called
 *   once per **completed** move — a released drag, or one arrow-key press — with
 *   the new order and the key of the column that moved. Never fired for a
 *   `setColumnOrder` call: the caller already knows an order they just supplied.
 */

/**
 * @template Row
 * @typedef {object} BsTableSelectionOptions
 * @property {'single' | 'multiple'} [mode='multiple'] - `'multiple'` renders
 *   checkboxes and a select-all header; `'single'` renders radios and no header
 *   control, because "select all" has no meaning for one.
 * @property {import('./table-selection.js').TableSelection<Row>} [selection] - An
 *   existing F94 selection to render. **Borrowed, not owned**: `destroy()`
 *   unsubscribes and leaves it alive, exactly as an injected `pipeline` is
 *   treated. Omitted, this table creates and owns one.
 * @property {readonly (string | number)[]} [initial] - Keys selected from the
 *   start. Only for a selection this table creates; passing both is a
 *   `TypeError`, since it would be two answers to one question.
 * @property {boolean} [selectAll=true] - Render the header select-all control.
 *   `false` keeps per-row selection and drops the bulk control, for a table where
 *   acting on a whole page is not something to make easy.
 * @property {BsTableSelectionLabels} [labels]
 * @property {ClassOption} [class] - Extra classes for the selection cells, header
 *   and body alike — a width, usually.
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
 * @property {import('./table-selection.js').TableSelection<Row>} [selection] - The
 *   F94 selection this table renders, present only when `options.selection` asked
 *   for one. Read it, command it, subscribe to it: the table reflects every change
 *   without re-rendering a row (F95).
 * @property {() => Record<string, number>} [getColumnWidths] - Every resizable
 *   column's current width in pixels, **measured from the document** rather than
 *   remembered, present only when `options.resize` asked for it. Hand the result
 *   to storage; hand it back to `setColumnWidths` on the next visit (F99).
 * @property {(widths: Record<string, number>) => void} [setColumnWidths] -
 *   Restore widths by column key. Partial: keys omitted keep what they have, and
 *   an unknown key is a `TypeError` rather than a silently ignored line of the
 *   layout someone saved.
 * @property {() => string[]} [getColumnOrder] - The column keys in the order they
 *   are displayed, present only when `options.reorder` asked for it. Save it; hand
 *   it back to `setColumnOrder` on the next visit (F100).
 * @property {(order: readonly string[]) => void} [setColumnOrder] - Display the
 *   columns in this order. A **full permutation** of the column keys: a partial
 *   list is a `TypeError` naming what is missing, because "the rest, in some
 *   order" is two answers to one question and a saved layout deserves neither.
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
    selection: selectionOption,
    sticky: stickyOption,
    resize: resizeOption,
    reorder: reorderOption,
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
    // A column definition is hand-written configuration, so a mistyped
    // `sortible` is the same programming error a mistyped option is — and the
    // same rule applies (ADR-0056 extending ADR-0047). The destructuring is the
    // schema here too; the rest element is what the checks below never read.
    // Rows are **not** checked: those are data, and a record legitimately
    // carries keys this library does not model.
    const {
      key,
      label,
      format,
      align,
      headerClass,
      cellClass,
      sortable,
      html: columnHtml,
      sanitize: columnSanitize,
      type,
      compare,
      getValue,
      searchable,
      filterable,
      width,
      minWidth,
      resizable,
      movable,
      ...unknownColumn
    } = column;
    assertNoUnknownOptions(unknownColumn, api, `options.columns[${index}] property`);

    if (typeof key !== 'string' || key === '') {
      throw new TypeError(`${api}: options.columns[${index}].key must be a non-empty string`);
    }
    if (format !== undefined && typeof format !== 'function') {
      throw new TypeError(`${api}: options.columns[${index}].format must be a function`);
    }
    if (align !== undefined && !ALIGNMENTS.has(align)) {
      throw new TypeError(`${api}: options.columns[${index}].align must be start, center, or end`);
    }
    for (const [value, name] of [
      [width, 'width'],
      [minWidth, 'minWidth'],
    ]) {
      if (
        value !== undefined &&
        (typeof value !== 'number' || !(value > 0) || !Number.isFinite(value))
      ) {
        throw new TypeError(
          `${api}: options.columns[${index}].${name} must be a positive number of pixels`,
        );
      }
    }
    // `resizable` and `movable` are read by the destructuring above and nowhere
    // else: like `sortable` and `searchable` beside them, a boolean flag has no
    // malformed value worth a message that `Boolean(x)` would not already explain.
    void resizable;
    void movable;
  }
  if (onRowClick !== undefined && typeof onRowClick !== 'function') {
    throw new TypeError(`${api}: options.onRowClick must be a function`);
  }
  if (rowKey !== undefined && typeof rowKey !== 'string' && typeof rowKey !== 'function') {
    throw new TypeError(`${api}: options.rowKey must be a string or a function`);
  }

  // --- sticky header (F98) --------------------------------------------------
  /** @type {BsTableStickyOptions} */
  let stickyConfig = {};
  const wantsSticky = stickyOption !== undefined && stickyOption !== false;
  if (wantsSticky && stickyOption !== true) {
    assertPlainObject(stickyOption, 'options.sticky', api);
    stickyConfig = /** @type {BsTableStickyOptions} */ (stickyOption);
  }
  const {
    // `'0px'` rather than `'0'`, which is equally valid CSS: the DOM normalizes
    // the shorthand to `0px` when read back, and a documented default that does
    // not match what an inspector shows is a papercut for no gain.
    top: stickyTop = '0px',
    maxHeight: stickyMaxHeight,
    zIndex: stickyZIndex = 2,
    ...unknownSticky
  } = stickyConfig;
  if (wantsSticky) {
    assertNoUnknownOptions(unknownSticky, `${api}.sticky`);
    if (typeof stickyTop !== 'string' || stickyTop === '') {
      throw new TypeError(`${api}: options.sticky.top must be a non-empty CSS length`);
    }
    if (stickyMaxHeight !== undefined) {
      if (typeof stickyMaxHeight !== 'string' || stickyMaxHeight === '') {
        throw new TypeError(`${api}: options.sticky.maxHeight must be a non-empty CSS length`);
      }
      if (responsive === false) {
        throw new TypeError(
          `${api}: options.sticky.maxHeight needs options.responsive — without the wrapper there is no scroll container of ours to bound, and a height applied nowhere would leave the header not sticking with nothing to say why`,
        );
      }
    }
    if (!Number.isInteger(stickyZIndex)) {
      throw new TypeError(`${api}: options.sticky.zIndex must be an integer`);
    }
  }

  // --- column resize (F99) --------------------------------------------------
  /** @type {BsTableResizeOptions<Row>} */
  let resizeConfig = {};
  const wantsResize = resizeOption !== undefined && resizeOption !== false;
  if (wantsResize && resizeOption !== true) {
    assertPlainObject(resizeOption, 'options.resize', api);
    resizeConfig = /** @type {BsTableResizeOptions<Row>} */ (resizeOption);
  }
  const {
    min: resizeMin = 48,
    step: resizeStep = 16,
    handle: resizeHandle = 8,
    label: resizeLabel,
    onResize,
    ...unknownResize
  } = resizeConfig;
  if (wantsResize) {
    assertNoUnknownOptions(unknownResize, `${api}.resize`);
    for (const [value, name] of [
      [resizeMin, 'min'],
      [resizeStep, 'step'],
      [resizeHandle, 'handle'],
    ]) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${api}: options.resize.${name} must be a positive number of pixels`);
      }
    }
    for (const [value, name] of [
      [resizeLabel, 'label'],
      [onResize, 'onResize'],
    ]) {
      if (value !== undefined && typeof value !== 'function') {
        throw new TypeError(`${api}: options.resize.${name} must be a function`);
      }
    }
  }

  // --- column reorder (F100) ------------------------------------------------
  /** @type {BsTableReorderOptions<Row>} */
  let reorderConfig = {};
  const wantsReorder = reorderOption !== undefined && reorderOption !== false;
  if (wantsReorder && reorderOption !== true) {
    assertPlainObject(reorderOption, 'options.reorder', api);
    reorderConfig = /** @type {BsTableReorderOptions<Row>} */ (reorderOption);
  }
  const {
    handle: reorderHandle = 12,
    label: reorderLabel,
    onReorder,
    ...unknownReorder
  } = reorderConfig;
  if (wantsReorder) {
    assertNoUnknownOptions(unknownReorder, `${api}.reorder`);
    if (
      typeof reorderHandle !== 'number' ||
      !Number.isFinite(reorderHandle) ||
      reorderHandle <= 0
    ) {
      throw new TypeError(`${api}: options.reorder.handle must be a positive number of pixels`);
    }
    for (const [value, name] of [
      [reorderLabel, 'label'],
      [onReorder, 'onReorder'],
    ]) {
      if (value !== undefined && typeof value !== 'function') {
        throw new TypeError(`${api}: options.reorder.${name} must be a function`);
      }
    }
  }

  // --- selection (F95) ------------------------------------------------------
  /** @type {BsTableSelectionOptions<Row>} */
  let selectionConfig = {};
  if (selectionOption !== undefined && selectionOption !== false) {
    if (selectionOption !== true) {
      assertPlainObject(selectionOption, 'options.selection', api);
      selectionConfig = selectionOption;
    }
  }
  const wantsSelection = selectionOption !== undefined && selectionOption !== false;
  const {
    mode: selectionMode = 'multiple',
    selection: borrowedSelection,
    initial: selectionInitial,
    selectAll: wantsSelectAll = true,
    labels: selectionLabels = {},
    class: selectionClass,
    ...unknownSelection
  } = selectionConfig;
  if (wantsSelection) {
    assertNoUnknownOptions(unknownSelection, `${api}.selection`);
    assertPlainObject(selectionLabels, 'options.selection.labels', api);
    if (rowKey === undefined) {
      throw new TypeError(
        `${api}: options.selection requires options.rowKey — a selection keyed by index or identity does not survive a sort (F94)`,
      );
    }
    if (borrowedSelection !== undefined && selectionInitial !== undefined) {
      throw new TypeError(
        `${api}: pass options.selection.initial or an existing options.selection.selection, not both`,
      );
    }
    if (typeof wantsSelectAll !== 'boolean') {
      throw new TypeError(`${api}: options.selection.selectAll must be a boolean`);
    }
    if (borrowedSelection !== undefined) {
      for (const method of ['keyOf', 'toggle', 'selectAll', 'stats', 'on']) {
        if (typeof (/** @type {any} */ (borrowedSelection)[method]) !== 'function') {
          throw new TypeError(
            `${api}: options.selection.selection must be a tableSelection — ${method}() is missing`,
          );
        }
      }
    }
  }
  const selection = !wantsSelection
    ? undefined
    : (borrowedSelection ??
      tableSelection({
        rowKey: /** @type {string | ((row: Row, index: number) => string | number)} */ (rowKey),
        mode: selectionMode,
        ...(selectionInitial === undefined ? {} : { initial: selectionInitial }),
      }));
  /** A borrowed selection outlives this table, exactly as a borrowed pipeline does. */
  const ownsSelection = wantsSelection && borrowedSelection === undefined;
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

  // The pipeline gets exactly the F42 fields, projected rather than spread: a
  // BsTableColumn is a superset (label, format, align, the class and markup
  // options are this renderer's), and /table rejects a key it does not know just
  // as this entry does (ADR-0047, ADR-0056). Passing the superset wholesale would
  // make one declaration serving both halves a lie the moment either tightened.
  const pipeline =
    injected ??
    tablePipeline({
      source: data ?? [],
      columns: columns.map(({ key, type, compare, getValue, searchable, filterable }) => ({
        key,
        ...(type === undefined ? {} : { type }),
        ...(compare === undefined ? {} : { compare }),
        ...(getValue === undefined ? {} : { getValue }),
        ...(searchable === undefined ? {} : { searchable }),
        ...(filterable === undefined ? {} : { filterable }),
      })),
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
  /**
   * The node that scrolls, when this instance owns one.
   *
   * Kept as its own reference rather than read off `element`: with `controls`,
   * `element` becomes the outer band wrapper, and bounding *that* would scroll the
   * filter row and the pager out of view along with the rows — the opposite of
   * what a sticky header is for.
   *
   * @type {Element | null}
   */
  let scrollContainer = null;
  if (responsive !== false) {
    element = doc.createElement('div');
    applyClasses(
      element,
      [typeof responsive === 'string' ? `table-responsive-${responsive}` : 'table-responsive'],
      undefined,
      api,
    );
    element.append(table);
    scrollContainer = element;
  }

  // The header is built once: it depends on the columns, which are fixed for
  // the life of the instance. Only the body answers to the pipeline.
  const headRow = doc.createElement('tr');

  /**
   * The header's select-all control, when there is one (F95). `null` in single
   * mode and when `selectAll: false` — a bulk control a table does not want is
   * not rendered at all rather than rendered disabled.
   *
   * @type {Element | null}
   */
  let selectAllBox = null;
  /**
   * Radios need a group name, and two single-select tables on one page must not
   * share it — the same `name` makes them one group, so selecting in the second
   * silently clears the first.
   *
   * Minted with {@link uniqueId} and then **stamped on the header cell as its
   * `id`**, which is what makes the uniqueness real: `uniqueId` proves a string
   * is free by asking the document for that id, so a name never written into the
   * document would be handed out again to the next table (ADR-0042's registry is
   * the document, not a counter). Found by the two-tables test, which is the
   * only place it shows.
   */
  const selectionName = selection === undefined ? '' : uniqueId(doc, 'egl-sel');
  /**
   * The selection column's header, kept only so F99 can give that column a
   * `<col>` width of its own. Under `table-layout: fixed` a column with no
   * declared width shares the leftover space equally with the others, so the
   * checkbox column would grow to a quarter of the table the moment the data
   * columns were pinned.
   *
   * @type {Element | null}
   */
  let selectionTh = null;
  /** The `<col>` keeping the selection column narrow once pinned. @type {Element | null} */
  let selectionCol = null;
  if (selection !== undefined) {
    const th = doc.createElement('th');
    th.setAttribute('scope', 'col');
    th.setAttribute('id', selectionName);
    applyClasses(th, [], selectionClass, api);
    if (selectionMode === 'multiple' && wantsSelectAll) {
      selectAllBox = doc.createElement('input');
      selectAllBox.setAttribute('type', 'checkbox');
      selectAllBox.setAttribute('class', 'form-check-input');
      selectAllBox.setAttribute('aria-label', selectionLabels.selectAll ?? 'Select all');
      th.append(selectAllBox);
    } else {
      // No control, but the column still needs a name: an unlabelled header cell
      // is announced as nothing at all (NFR-21).
      th.setAttribute('aria-label', selectionLabels.column ?? 'Select');
    }
    selectionTh = th;
    headRow.append(th);
  }

  /**
   * One header cell per column, in column order — the only thing F99 needs from
   * this loop, and cheaper than stamping an attribute and querying for it back.
   *
   * @type {Element[]}
   */
  const headerCells = [];
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
    headerCells.push(th);
    headRow.append(th);
  }
  thead.append(headRow);

  if (wantsSticky) {
    // Every `th` in the row, not the `thead` and not the `tr`. Sticky on a table
    // *section* is the tidier stylesheet and the worse bet: engines disagreed about
    // it for years, and a cell is the one place every engine has always honoured
    // it. Applying it per cell also means the F95 selection column sticks with the
    // rest, because it is simply another `th` in this row.
    //
    // Two properties beyond `position` are not decoration. `border-collapse:
    // collapse` — Bootstrap's default — draws cell borders on a shared edge that
    // does NOT travel with a sticky cell, so a scrolled header loses its bottom
    // rule; an inset shadow redraws it inside the cell, where it does travel. And
    // a table cell's background is transparent by default, so without one the rows
    // scroll visibly *through* the header. Both are read from Bootstrap's own
    // custom properties, so a theme (including `data-bs-theme="dark"`) keeps its
    // colours instead of being overridden by ours.
    for (const cell of headRow.children) {
      const style = /** @type {any} */ (cell).style;
      style.setProperty('position', 'sticky');
      style.setProperty('top', stickyTop);
      style.setProperty('z-index', String(stickyZIndex));
      style.setProperty('background-color', 'var(--bs-table-bg, var(--bs-body-bg, inherit))');
      style.setProperty('box-shadow', 'inset 0 -1px 0 var(--bs-border-color, currentColor)');
    }
    if (stickyMaxHeight !== undefined && scrollContainer !== null) {
      // `overflow-y` is set explicitly rather than left to `.table-responsive`,
      // which only asks for `overflow-x`. A height with nothing to scroll it is a
      // header that never sticks and never says why.
      const style = /** @type {any} */ (scrollContainer).style;
      style.setProperty('max-height', stickyMaxHeight);
      style.setProperty('overflow-y', 'auto');
    }
  }

  const controller = controllerFor(container);
  const interactive = onRowClick !== undefined;

  /** @type {(() => string[]) | undefined} */
  let getColumnOrder;
  /** @type {((next: readonly string[]) => void) | undefined} */
  let setColumnOrder;

  // --- column resize (F99) --------------------------------------------------
  //
  // Widths live on a `<colgroup>`: one `<col>` per column, and the width written
  // there governs the whole column. That is the entire reason this feature can
  // promise "no row re-render" as a structural fact rather than as a discipline —
  // a resize writes one style property on one node that is not a row, and the
  // 10 000 `<td>`s below it are never touched, never re-created, never read.
  //
  // The alternative every string-templating table reaches for — a width on each
  // `<th>`, or worse a re-render — is O(rows) per frame of a drag, and is why
  // those tables stutter.

  /**
   * @typedef {object} ResizeEntry
   * @property {Element} col - The `<col>` that owns this column's width.
   * @property {Element} th - Its header cell, which is what gets measured.
   * @property {Element | null} grip - The separator widget, absent on a column
   *   the caller exempted with `resizable: false`.
   * @property {number} min - This column's floor in pixels.
   */

  /**
   * The `<colgroup>`, when this instance built one. Only F99 creates it — without
   * declared widths there is nothing for a `<col>` to carry — so F100's
   * permutation checks for it rather than assuming it.
   *
   * @type {Element | null}
   */
  let colgroupNode = null;

  /** @type {Map<string, ResizeEntry>} */
  const resizeState = new Map();
  /** Widths this instance has written, in pixels. @type {Map<string, number>} */
  const columnWidths = new Map();
  /**
   * Whether the browser's chosen layout has been frozen yet.
   *
   * Deliberately **lazy**. `table-layout: fixed` is what makes a declared width
   * authoritative, and it is also a different-looking table: under it a column
   * with no width shares the leftover space equally instead of being sized to its
   * content. Applying it at build time would mean that merely *enabling* resize
   * re-laid-out a table nobody had touched yet — a capability changing the
   * appearance of the thing it was added to. So the table lays itself out
   * normally until the user disagrees with the result, and the first change pins
   * every column to the width it already had.
   */
  let pinned = false;

  /**
   * Measure a node's rendered width, or `0` where there is no layout to read —
   * jsdom, a detached tree, a server render.
   *
   * @param {Element} el
   * @returns {number}
   */
  const measureWidth = (el) =>
    Math.round(/** @type {any} */ (el).getBoundingClientRect?.().width ?? 0);

  /**
   * Clamp a width to its column's floor, write it, and tell assistive technology.
   *
   * @param {string} key
   * @param {number} px
   * @returns {void}
   */
  const applyWidth = (key, px) => {
    const entry = resizeState.get(key);
    if (entry === undefined) return;
    const next = Math.max(entry.min, Math.round(px));
    columnWidths.set(key, next);
    /** @type {any} */ (entry.col).style.setProperty('width', `${next}px`);
    entry.grip?.setAttribute('aria-valuenow', String(next));
  };

  /**
   * Freeze the layout the browser chose, once, at the first change.
   *
   * @returns {void}
   */
  const pinLayout = () => {
    if (pinned) return;
    pinned = true;
    for (const [key, entry] of resizeState) {
      applyWidth(key, columnWidths.get(key) ?? measureWidth(entry.th));
    }
    if (selectionCol !== null && selectionTh !== null) {
      // Not through `applyWidth`: the selection column has no entry, no grip and
      // no caller-visible width, because it is ours rather than one of the
      // caller's columns. It needs a number only so `fixed` does not hand it a
      // quarter of the table. `1px` is where a layout-free host lands, and a real
      // engine never sees it.
      /** @type {any} */ (selectionCol).style.setProperty(
        'width',
        `${Math.max(1, measureWidth(selectionTh))}px`,
      );
    }
    /** @type {any} */ (table).style.setProperty('table-layout', 'fixed');
  };

  /**
   * Every resizable column's width in pixels.
   *
   * **The width this table enforces, not the pixel the engine painted** — and
   * they are not the same number. Bootstrap's `.table` is `width: 100%`, and
   * `table-layout: fixed` scales the declared widths to fill that, so a column
   * pinned to its 60 px floor can measure 67 px on a wide container. Reporting
   * the painted figure would mean `setColumnWidths(getColumnWidths())` drifted a
   * few pixels on every round-trip, and that a layout saved on a wide window
   * restored wrong on a narrow one. The declared widths are resolution-
   * independent, which is exactly what persisting a layout needs.
   *
   * Before the first change there is nothing declared to report, so those columns
   * are measured: an empty object is not an answer a caller can save. After
   * pinning every column has a declared width, so the measurement is never
   * consulted again — which is also what keeps this off the layout path.
   *
   * @returns {Record<string, number>}
   */
  const readColumnWidths = () => {
    /** @type {Record<string, number>} */
    const out = {};
    for (const [key, entry] of resizeState) {
      out[key] = columnWidths.get(key) ?? measureWidth(entry.th);
    }
    return out;
  };

  /**
   * Restore widths by column key.
   *
   * Validated in full **before** anything is written, so a saved layout with one
   * bad entry leaves the table as it was rather than half-applied.
   *
   * @param {Record<string, number>} next
   * @returns {void}
   */
  const writeColumnWidths = (next) => {
    assertPlainObject(next, 'widths', `${api}.setColumnWidths`);
    for (const [key, value] of Object.entries(next)) {
      if (!resizeState.has(key)) {
        throw new TypeError(`${api}: setColumnWidths() names no resizable column '${key}'`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new TypeError(
          `${api}: setColumnWidths() width for '${key}' must be a positive number of pixels`,
        );
      }
    }
    pinLayout();
    for (const [key, value] of Object.entries(next)) applyWidth(key, value);
  };

  if (wantsResize) {
    const colgroup = doc.createElement('colgroup');
    colgroupNode = colgroup;
    if (selectionTh !== null) {
      selectionCol = doc.createElement('col');
      colgroup.append(selectionCol);
    }
    for (const [index, column] of columns.entries()) {
      const col = doc.createElement('col');
      const th = headerCells[index];
      const min = column.minWidth ?? resizeMin;
      /** @type {Element | null} */
      let grip = null;
      if (column.resizable !== false) {
        // `role="separator"` with a tab stop and `aria-value*` is the platform's
        // own window-splitter pattern, and adopting it is what makes F99's
        // keyboard requirement one node rather than two: the same element takes
        // the drag and the arrow keys, so there is one control carrying one
        // state, instead of a drag hotspot beside a hidden button that has to be
        // kept in step with it.
        grip = doc.createElement('span');
        grip.setAttribute('role', 'separator');
        grip.setAttribute('aria-orientation', 'vertical');
        grip.setAttribute('tabindex', '0');
        grip.setAttribute('aria-valuemin', String(min));
        grip.setAttribute('data-egl-resize', column.key);
        grip.setAttribute(
          'aria-label',
          resizeLabel === undefined ? `Resize ${labelText(column)}` : resizeLabel(column),
        );
        const gripStyle = /** @type {any} */ (grip).style;
        gripStyle.setProperty('position', 'absolute');
        gripStyle.setProperty('top', '0');
        gripStyle.setProperty('bottom', '0');
        gripStyle.setProperty('right', '0');
        gripStyle.setProperty('width', `${resizeHandle}px`);
        gripStyle.setProperty('cursor', 'col-resize');
        // Without this a drag on a touch screen scrolls the page instead of
        // resizing: the browser claims the gesture before the first
        // `pointermove` is delivered. Not a nicety — the difference between
        // working and not working on half the devices that exist.
        gripStyle.setProperty('touch-action', 'none');
        gripStyle.setProperty('user-select', 'none');
        th.append(grip);
        // The grip is positioned against its header cell, so that cell has to be
        // a containing block — and `position: sticky` already is one. Writing
        // `relative` over a sticky header would silently unstick it, which is why
        // this asks rather than assumes: F98 and F99 on the same table is the
        // combination a caller reaches for first.
        if (!wantsSticky) /** @type {any} */ (th).style.setProperty('position', 'relative');
      }
      resizeState.set(column.key, { col, th, grip, min });
      if (column.width !== undefined) columnWidths.set(column.key, column.width);
      colgroup.append(col);
    }
    // After any `<caption>`, which must stay the table's first child, and before
    // the sections — where the HTML parser would have put it.
    table.insertBefore(colgroup, thead);

    /** @type {{ key: string, startX: number, startWidth: number, grip: Element } | null} */
    let drag = null;
    /** @param {Event} event @returns {Element | null} */
    const gripOf = (event) =>
      /** @type {any} */ (event.target)?.closest?.('[data-egl-resize]') ?? null;
    /** @param {string} key @returns {void} */
    const commit = (key) => onResize?.(readColumnWidths(), key);

    // Five delegated listeners on the header row, whatever the column count — and
    // every one of them on a node this instance built. Pointer capture is what
    // buys that: from `pointerdown` on, the engine retargets every move and the
    // release to the captured grip, so they bubble to exactly here. The usual
    // shape — listen on `document` for the duration of a drag — reaches into
    // someone else's node in someone else's realm, which is the trap BUG-0003 was.
    headRow.addEventListener(
      'pointerdown',
      (event) => {
        const grip = gripOf(event);
        if (grip === null) return;
        // Stops the text selection a drag across a header would otherwise paint,
        // and the native drag some engines begin from a mousedown in a cell.
        event.preventDefault();
        pinLayout();
        // Both casts assert something the code around them has already
        // established, and neither is a fallback: `closest` matched on this very
        // attribute, and `pinLayout` has just given every column a width. Writing
        // them as `?? ''` and `?? 0` would add two branches no execution can take,
        // which this project deletes rather than mock-covers (the M2.4 precedent).
        const key = /** @type {string} */ (grip.getAttribute('data-egl-resize'));
        drag = {
          key,
          startX: /** @type {any} */ (event).clientX,
          startWidth: /** @type {number} */ (columnWidths.get(key)),
          grip,
        };
        // Called outright, not optionally. Pointer capture is Safari 13, well
        // under the 16.4 floor (ADR-0050), so an optional call would be a branch
        // no supported runtime takes — the same reasoning that deleted the
        // `AbortSignal.timeout` fallback. jsdom lacks it, and the suite supplies
        // it, which is what it already does for pointer events themselves.
        /** @type {any} */ (grip).setPointerCapture(/** @type {any} */ (event).pointerId);
      },
      { signal: controller.signal },
    );
    headRow.addEventListener(
      'pointermove',
      (event) => {
        if (drag === null) return;
        // From the gesture's own origin, never from the previous move: an
        // incremental delta accumulates every clamp at the minimum, so dragging
        // left past the floor and back leaves the column narrower than it was.
        applyWidth(drag.key, drag.startWidth + /** @type {any} */ (event.clientX - drag.startX));
      },
      { signal: controller.signal },
    );
    /** @param {Event} event @returns {void} */
    const endDrag = (event) => {
      if (drag === null) return;
      const { key, grip } = drag;
      drag = null;
      /** @type {any} */ (grip).releasePointerCapture(/** @type {any} */ (event).pointerId);
      commit(key);
    };
    headRow.addEventListener('pointerup', endDrag, { signal: controller.signal });
    headRow.addEventListener('pointercancel', endDrag, { signal: controller.signal });
    headRow.addEventListener(
      'keydown',
      (event) => {
        const grip = gripOf(event);
        if (grip === null) return;
        const pressed = /** @type {any} */ (event).key;
        const direction = pressed === 'ArrowLeft' ? -1 : pressed === 'ArrowRight' ? 1 : 0;
        if (direction === 0) return;
        // Otherwise the arrow scrolls the F71 wrapper sideways while the column
        // resizes, which reads as the table fighting the user.
        event.preventDefault();
        pinLayout();
        const key = /** @type {string} */ (grip.getAttribute('data-egl-resize'));
        const factor = /** @type {any} */ (event).shiftKey === true ? 4 : 1;
        applyWidth(
          key,
          /** @type {number} */ (columnWidths.get(key)) + direction * resizeStep * factor,
        );
        commit(key);
      },
      { signal: controller.signal },
    );
    headRow.addEventListener(
      'click',
      (event) => {
        // A grip lives inside a sortable header, and F51's sort delegation sits
        // on `thead` — one level above this row. Without this, every finished
        // drag also re-sorts the column it just resized.
        if (gripOf(event) !== null) event.stopPropagation();
      },
      { signal: controller.signal },
    );
  }

  /**
   * Write one row's selected state — the control, the attribute and the class.
   *
   * `data-egl-selected` and Bootstrap's own `.table-active` are both set, which
   * is what lets CSS style a selected row **without the caller re-rendering**
   * (F95): selection changes touch three attributes per affected row and nothing
   * else.
   *
   * @param {Element} tr
   * @param {Element | null} box
   * @param {boolean} isSelected
   * @returns {void}
   */
  function applyRowState(tr, box, isSelected) {
    if (isSelected) tr.setAttribute('data-egl-selected', '');
    else tr.removeAttribute('data-egl-selected');
    tr.classList.toggle('table-active', isSelected);
    if (box === null) return;
    // `any` rather than a structural cast: these are native control properties,
    // and `setValue` (F45) reaches them the same way for the same reason — a
    // narrower type would be a claim about the element that the DOM lib does not
    // make for `Element`.
    /** @type {any} */ (box).checked = isSelected;
  }
  /** @type {readonly Row[]} */
  let rendered = [];

  // --- column reorder (F100) --------------------------------------------------
  //
  // The order is a **permutation of column keys**, and it is the whole model: the
  // F42 derivation never sees it, because which column a filter or a sort
  // addresses has nothing to do with where that column is drawn. That is what
  // keeps this feature presentational, and it is why `pipeline` needs no notion
  // of order at all.
  //
  // Applying an order **moves nodes; it never rebuilds them**. A row's cells are
  // the same `<td>` objects afterwards, in a different sequence — so a reorder
  // costs O(rows) moves rather than O(rows × columns) constructions, and a
  // selected row stays selected without anything being reflected back onto it.

  /** Column keys in display order. Identity until something moves it. */
  let order = columns.map((column) => column.key);
  /**
   * The columns in display order — what every render iterates.
   *
   * Kept as its own array rather than derived per render: a re-render caused by a
   * pipeline change has to produce the *current* order, and reading it from one
   * place is what makes that true without `renderBody` knowing F100 exists.
   *
   * @type {readonly BsTableColumn<Row>[]}
   */
  let orderedColumns = columns;

  if (wantsReorder) {
    /** @type {Map<string, Element>} */
    const headerOf = new Map(columns.map((column, index) => [column.key, headerCells[index]]));
    /** @type {Map<string, BsTableColumn<Row>>} */
    const columnOf = new Map(columns.map((column) => [column.key, column]));

    /**
     * Rearrange one row's cells into `from`, an array of source indices.
     *
     * The leading offset is **computed per row** rather than passed in: a header
     * row and a body row carry the F95 selection cell, the F67 filter row does
     * not, and the empty-state row is a single `colspan` cell that must be left
     * alone. `kids.length - from.length` tells each of those apart without this
     * function knowing which is which — and it keeps working when the filter
     * row's own leading cell arrives (BUG-0005).
     *
     * @param {Element} parent
     * @param {readonly number[]} from
     * @returns {void}
     */
    const permute = (parent, from) => {
      const kids = [...parent.children];
      const lead = kids.length - from.length;
      if (lead < 0) return;
      // `append` of nodes already in the tree *moves* them — no clone, no rebuild.
      parent.append(...from.map((index) => kids[index + lead]));
    };

    /**
     * Display the columns in `next`, moving every node that mirrors the order.
     *
     * @param {readonly string[]} next
     * @returns {void}
     */
    const applyOrder = (next) => {
      const from = next.map((key) => order.indexOf(key));
      if (colgroupNode !== null) permute(colgroupNode, from);
      // Every row of the head, not just the header: the F67 filter row mirrors
      // the columns too, and leaving it behind would put each filter under its
      // neighbour.
      for (const tr of thead.children) permute(tr, from);
      for (const tr of tbody.children) permute(tr, from);
      order = [...next];
      orderedColumns = next.map((key) => /** @type {BsTableColumn<Row>} */ (columnOf.get(key)));
    };

    /**
     * Move one column by `delta` slots, if there is a slot to move into.
     *
     * @param {string} key
     * @param {number} delta
     * @returns {boolean} Whether anything moved.
     */
    const moveBy = (key, delta) => {
      const at = order.indexOf(key);
      const to = at + delta;
      if (to < 0 || to >= order.length) return false;
      const next = [...order];
      next.splice(to, 0, ...next.splice(at, 1));
      applyOrder(next);
      return true;
    };

    for (const [index, column] of columns.entries()) {
      if (column.movable === false) continue;
      const th = headerCells[index];
      // `role="button"` and a tab stop, because that is what it is: a control
      // that moves something. The keyboard path is not an alternative bolted on
      // beside the drag — it is the same node, which is the F99 lesson applied
      // (ADR-0068).
      const handle = doc.createElement('span');
      handle.setAttribute('role', 'button');
      handle.setAttribute('tabindex', '0');
      handle.setAttribute('data-egl-move', column.key);
      handle.setAttribute(
        'aria-label',
        reorderLabel === undefined ? `Move ${labelText(column)}` : reorderLabel(column),
      );
      const handleStyle = /** @type {any} */ (handle).style;
      handleStyle.setProperty('position', 'absolute');
      handleStyle.setProperty('top', '0');
      handleStyle.setProperty('bottom', '0');
      // The leading edge, where F99's resize grip takes the trailing one: a table
      // with both has one control per edge and they cannot overlap.
      handleStyle.setProperty('left', '0');
      handleStyle.setProperty('width', `${reorderHandle}px`);
      handleStyle.setProperty('cursor', 'grab');
      handleStyle.setProperty('touch-action', 'none');
      handleStyle.setProperty('user-select', 'none');
      th.append(handle);
      // Same containing-block rule as F99, and set unconditionally here rather
      // than only when resize left it unset: writing `relative` twice costs
      // nothing, and writing it over `sticky` would silently unstick the header.
      if (!wantsSticky) /** @type {any} */ (th).style.setProperty('position', 'relative');
    }

    /** @param {Event} event @returns {Element | null} */
    const handleOf = (event) =>
      /** @type {any} */ (event.target)?.closest?.('[data-egl-move]') ?? null;

    /**
     * Header widths in display order.
     *
     * Read at the start of a gesture and again after each swap — **never per
     * pointer move**, which is the per-frame layout read F98 refused and F99
     * inherited. A drag crosses a handful of boundaries; it fires hundreds of
     * moves.
     *
     * @type {number[]}
     */
    let headerWidths = [];
    const measureHeaders = () => {
      headerWidths = order.map(
        (key) => /** @type {any} */ (headerOf.get(key)).getBoundingClientRect().width,
      );
    };

    /** @type {{ key: string, handle: Element, moved: boolean, from: number } | null} */
    let drag = null;

    headRow.addEventListener(
      'pointerdown',
      (event) => {
        const handle = handleOf(event);
        if (handle === null) return;
        event.preventDefault();
        const key = /** @type {string} */ (handle.getAttribute('data-egl-move'));
        drag = { key, handle, moved: false, from: /** @type {any} */ (event).clientX };
        measureHeaders();
        /** @type {any} */ (handle).setPointerCapture(/** @type {any} */ (event).pointerId);
        /** @type {any} */ (handle).style.setProperty('cursor', 'grabbing');
      },
      { signal: controller.signal },
    );
    headRow.addEventListener(
      'pointermove',
      (event) => {
        if (drag === null) return;
        const at = order.indexOf(drag.key);
        // **Displacement**, not absolute position: how far the pointer has
        // travelled since the gesture began, against half the neighbour's width.
        // Measuring from the pointer's own start is what makes the grab point
        // irrelevant — the handle sits on the leading edge, so an absolute rule
        // would have made a one-slot move cost the column's own width plus half
        // the neighbour's, which is not a gesture anybody would guess.
        const travelled = /** @type {any} */ (event).clientX - drag.from;
        // `Infinity` at the ends: a column at the edge has no neighbour to pass,
        // and no threshold can be crossed.
        const ahead = at < order.length - 1 ? headerWidths[at + 1] : Number.POSITIVE_INFINITY;
        const behind = at > 0 ? headerWidths[at - 1] : Number.POSITIVE_INFINITY;
        // Swapping live rather than drawing a drop indicator means the drag has
        // no extra node and no extra CSS, and the table shows the result instead
        // of a promise of it.
        if (travelled > ahead / 2) {
          moveBy(drag.key, 1);
          drag.from += ahead;
        } else if (-travelled > behind / 2) {
          moveBy(drag.key, -1);
          drag.from -= behind;
        } else {
          return;
        }
        drag.moved = true;
        measureHeaders();
      },
      { signal: controller.signal },
    );
    /** @param {Event} event @returns {void} */
    const endDrag = (event) => {
      if (drag === null) return;
      const { key, handle, moved } = drag;
      drag = null;
      /** @type {any} */ (handle).releasePointerCapture(/** @type {any} */ (event).pointerId);
      /** @type {any} */ (handle).style.setProperty('cursor', 'grab');
      // Only a gesture that changed something is a change. A press and release on
      // a handle is how a user finds out what it is.
      if (moved) onReorder?.([...order], key);
    };
    headRow.addEventListener('pointerup', endDrag, { signal: controller.signal });
    headRow.addEventListener('pointercancel', endDrag, { signal: controller.signal });
    headRow.addEventListener(
      'keydown',
      (event) => {
        const handle = handleOf(event);
        if (handle === null) return;
        const pressed = /** @type {any} */ (event).key;
        const delta = pressed === 'ArrowLeft' ? -1 : pressed === 'ArrowRight' ? 1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const key = /** @type {string} */ (handle.getAttribute('data-egl-move'));
        if (!moveBy(key, delta)) return;
        // The handle travelled with its header, and moving a node can drop the
        // focus it was holding. Restoring it is what lets a user press the arrow
        // twice — without it the second press goes nowhere.
        /** @type {any} */ (handle).focus();
        onReorder?.([...order], key);
      },
      { signal: controller.signal },
    );
    headRow.addEventListener(
      'click',
      (event) => {
        // The handle sits inside a sortable header and F51's sort delegation is
        // on `thead`, one level up: without this, every finished drag also sorts
        // the column it just moved.
        if (handleOf(event) !== null) event.stopPropagation();
      },
      { signal: controller.signal },
    );

    setColumnOrder = (next) => {
      if (!Array.isArray(next)) {
        throw new TypeError(`${api}: setColumnOrder() expects an array of column keys`);
      }
      // Unknown keys first: a typo should be reported as a typo, not as the
      // missing column it happens to displace.
      for (const key of next) {
        if (!columnOf.has(key)) {
          throw new TypeError(`${api}: setColumnOrder() names no such column '${key}'`);
        }
      }
      const seen = new Set(next);
      const missing = order.filter((key) => !seen.has(key));
      if (missing.length > 0) {
        // A partial order is refused rather than interpreted. "The rest, in some
        // order" is two answers to one question, and the caller who saved this
        // layout deserves to be told which columns it forgot.
        //
        // One condition covers both shapes this rejects, and that is not a
        // shortcut: every key is known by now, so an array of the right length
        // with a duplicate in it is necessarily an array with something missing.
        throw new TypeError(
          `${api}: setColumnOrder() needs every column key exactly once, and is missing ${missing
            .map((key) => `'${key}'`)
            .join(', ')}`,
        );
      }
      applyOrder(next);
    };
    getColumnOrder = () => [...order];
  }

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
        // The selection column counts: a colspan short by one leaves the empty
        // message hanging under the wrong headers.
        td.setAttribute('colspan', String(columns.length + (selection === undefined ? 0 : 1)));
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

    if (selection !== undefined) {
      const key = selection.keyOf(row, index);
      const cell = doc.createElement('td');
      applyClasses(cell, [], selectionClass, api);
      const box = doc.createElement('input');
      // A radio in single mode, a checkbox in multiple: the native control is
      // keyboard-operable by construction, which is most of what F95 asks for,
      // and it is the control a user already knows how to read.
      box.setAttribute('type', selectionMode === 'single' ? 'radio' : 'checkbox');
      box.setAttribute('class', 'form-check-input');
      box.setAttribute('data-egl-select', '');
      if (selectionMode === 'single') box.setAttribute('name', selectionName);
      // The key, not "checkbox" (F95). A record id is language-neutral and names
      // the row; a phrase is one option away.
      box.setAttribute(
        'aria-label',
        selectionLabels.select === undefined ? key : selectionLabels.select(row, key),
      );
      cell.append(box);
      tr.append(cell);
      applyRowState(tr, box, selection.hasKey(key));
    }

    for (const column of orderedColumns) {
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

  /**
   * Rows this table currently shows, paired with their control. Rebuilt on every
   * body render; read on every selection change, which is what makes reflection
   * O(page) and free of a re-render.
   *
   * @returns {{ tr: Element, box: Element | null, row: Row, index: number }[]}
   */
  const renderedRows = () =>
    [...tbody.children].flatMap((tr) => {
      const index = Number(tr.getAttribute('data-egl-index'));
      // A malformed marker makes `index` NaN, and `rendered[NaN]` is undefined,
      // so the same line that rejects a foreign row rejects an unreadable one —
      // no separate NaN branch, which coverage proved unreachable.
      const row = rendered[index];
      if (row === undefined) return [];
      return [{ tr, box: tr.querySelector('input[data-egl-select]'), row, index }];
    });

  /**
   * Push the selection into the markup: each row's control and class, then the
   * header's tri-state.
   *
   * The header is the interesting part. `indeterminate` is a **property, not an
   * attribute** — there is no `indeterminate=""` in HTML — so it can only be set
   * from script, which is exactly why F95 names it: a partially-selected page
   * whose header shows an empty box tells the user "nothing here is selected",
   * and the next click selects a page they thought was untouched.
   *
   * @returns {void}
   */
  const reflectSelection = () => {
    if (selection === undefined) return;
    const visible = renderedRows();
    for (const { tr, box, row, index } of visible) {
      applyRowState(tr, box, selection.isSelected(row, index));
    }
    if (selectAllBox === null) return;
    const { all, some } = selection.stats(visible.map((entry) => entry.row));
    /** @type {any} */ (selectAllBox).checked = all;
    /** @type {any} */ (selectAllBox).indeterminate = some;
  };

  if (selection !== undefined) {
    tbody.addEventListener(
      'change',
      (event) => {
        const target = /** @type {Element | null} */ (event.target);
        if (target === null || !target.hasAttribute?.('data-egl-select')) return;
        const tr = target.closest('tr[data-egl-index]');
        // Direct children only, for the same reason row activation checks it: a
        // nested table's controls carry our marker and would resolve against our
        // rows — silently the wrong record.
        if (tr === null || tr.parentElement !== tbody) return;
        const index = Number(tr.getAttribute('data-egl-index'));
        const row = rendered[index];
        if (row === undefined) return;
        // The control's own state is authoritative: the browser has already
        // flipped it, and fighting that is how a checkbox starts feeling broken.
        if (/** @type {any} */ (target).checked) selection.select(row, index);
        else selection.deselect(row, index);
      },
      { signal: controller.signal },
    );

    if (selectAllBox !== null) {
      selectAllBox.addEventListener(
        'change',
        () => {
          const rows = renderedRows().map((entry) => entry.row);
          // **This page, and only this page** (F94). Never "everything matching
          // the filter" and never "everything in the source": both are guesses
          // about intent, and both have shipped as data-loss bugs. What the user
          // cannot see, this control does not touch — and `selection.stats()`
          // keeps the rest countable.
          if (/** @type {any} */ (selectAllBox).checked) {
            selection.selectAll(rows);
          } else {
            selection.deselectAll(rows);
          }
        },
        { signal: controller.signal },
      );
    }
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
          // The F67 filter row mirrors the columns, so it has to know about the
          // one column that is not one of the caller's (BUG-0005).
          selectionClass: selection === undefined ? null : (selectionClass ?? ''),
        });
  if (wired !== null) element = wired.element;

  renderBody(pipeline.view());
  reflectSelection();
  const unsubscribeSelection =
    selection === undefined ? null : selection.on('change', reflectSelection);
  const unsubscribe = pipeline.on('change', (view) => {
    renderBody(view);
    // Rows are new nodes; their controls start from the selection, and the header
    // re-reads a page that has just changed underneath it.
    reflectSelection();
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
    unsubscribeSelection?.();
    // Same borrowed/owned rule as the pipeline: a selection handed to us keeps
    // its keys and its other subscribers, because the caller may well be
    // rendering it somewhere else too. One we made goes with us.
    if (ownsSelection) selection?.destroy();
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
    ...(selection === undefined ? {} : { selection }),
    ...(wantsReorder
      ? {
          getColumnOrder: /** @type {() => string[]} */ (getColumnOrder),
          /** @param {readonly string[]} next */
          setColumnOrder: (next) => {
            if (destroyed) {
              throw new TypeError(`${api}: setColumnOrder() was called after destroy()`);
            }
            /** @type {(next: readonly string[]) => void} */ (setColumnOrder)(next);
          },
        }
      : {}),
    ...(wantsResize
      ? {
          getColumnWidths: readColumnWidths,
          /** @param {Record<string, number>} widths */
          setColumnWidths: (widths) => {
            if (destroyed) {
              throw new TypeError(`${api}: setColumnWidths() was called after destroy()`);
            }
            writeColumnWidths(widths);
          },
        }
      : {}),
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
 *   selectionClass: ClassOption | null,
 * }} context
 * @returns {{ element: Element, parts: BsTableControlParts, reflect: (view: any) => void, destroy: () => void }}
 * @throws {TypeError} On a malformed control option.
 */
function buildControls(context) {
  const { controls, columns, pipeline, doc, table, thead, pageSize, api, selectionClass } = context;
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
    const {
      label: searchLabel,
      placeholder,
      class: searchClass,
      ...unknownSearch
    } = search === true ? {} : opts(search, 'options.controls.search', api);
    assertNoUnknownOptions(unknownSearch, api, 'options.controls.search property');
    const input = doc.createElement('input');
    input.setAttribute('type', 'search');
    // An accessible name has to be words, so — unlike a glyph — it cannot have a
    // language-neutral default. English, and injectable (the F57/F65 precedent).
    input.setAttribute('aria-label', searchLabel ?? 'Search');
    if (placeholder !== undefined) {
      input.setAttribute('placeholder', placeholder);
    }
    applyClasses(input, ['form-control', 'form-control-sm', 'w-auto'], searchClass, api);
    header.append(input);
    bindings.search = input;
    parts.search = input;
  }

  if (pageSizeControl !== undefined && pageSizeControl !== false) {
    const {
      options: sizeOptions,
      allLabel,
      label: pageSizeLabel,
      class: pageSizeClass,
      ...unknownPageSize
    } = pageSizeControl === true ? {} : opts(pageSizeControl, 'options.controls.pageSize', api);
    assertNoUnknownOptions(unknownPageSize, api, 'options.controls.pageSize property');
    const select = doc.createElement('select');
    select.setAttribute('aria-label', pageSizeLabel ?? 'Rows per page');
    applyClasses(select, ['form-select', 'form-select-sm', 'w-auto'], pageSizeClass, api);

    const sizes = sizeOptions ?? DEFAULT_PAGE_SIZES;
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
    if (allLabel !== undefined) {
      // Only on request: "All" is a word, and shipping one would put English in
      // every consumer's UI (NFR-21). An empty value stops paginating (F51).
      const option = doc.createElement('option');
      option.setAttribute('value', '');
      option.textContent = allLabel;
      if (pageSize === undefined) option.setAttribute('selected', '');
      select.append(option);
    }
    header.append(select);
    bindings.pageSize = select;
    parts.pageSize = select;
  }

  if (filterRow !== undefined && filterRow !== false) {
    const {
      label: filterLabel,
      inputClass,
      class: filterRowClass,
      ...unknownFilterRow
    } = filterRow === true ? {} : opts(filterRow, 'options.controls.filterRow', api);
    assertNoUnknownOptions(unknownFilterRow, api, 'options.controls.filterRow property');
    if (filterLabel !== undefined && typeof filterLabel !== 'function') {
      throw new TypeError(`${api}: options.controls.filterRow.label must be a function`);
    }
    const row = doc.createElement('tr');
    applyClasses(row, [], filterRowClass, api);
    /** @type {Record<string, Element>} */
    const filters = {};
    if (selectionClass !== null) {
      // A spacer under the F95 checkbox column, and the reason BUG-0005 existed:
      // the header row and every body row prepend a cell for that column and this
      // row did not, so every filter sat one column to the left of the column it
      // filters — silently, because the wiring is by key and stayed correct. A
      // sighted user and a screen-reader user were reading different tables.
      //
      // A `<td>`, not a `<th scope="row">`: the cells beside it are `<td>` for a
      // stated reason — they are controls, and a header cell here would attach
      // itself to the data below — and that reason does not stop applying because
      // a cell is empty. A row header would also claim this row is *about* the
      // selection column, which it is not. It carries the selection column's own
      // class so it lines up with it even without the F99 `<colgroup>`.
      const spacer = doc.createElement('td');
      applyClasses(spacer, [], selectionClass === '' ? undefined : selectionClass, api);
      row.append(spacer);
    }
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
          filterLabel === undefined ? `Filter ${labelText(column)}` : filterLabel(column),
        );
        applyClasses(input, ['form-control', 'form-control-sm'], inputClass, api);
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
