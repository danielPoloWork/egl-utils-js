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
import { liveRegion } from './dom-a11y.js';
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
 * @property {boolean} [visible] - `false` starts this column hidden (F128). It is
 *   **rendering, not model**: the column keeps its filter, its sort, its width and
 *   its position while hidden, and `showColumn` brings all four back with it,
 *   because the F42 derivation is never told which columns a viewer can see.
 * @property {boolean} [hideable] - `false` withholds this column from the F129
 *   chooser, so a user cannot hide it. `hideColumn` still can, for the same reason
 *   `movable: false` still takes a position — the exemption is from the user, not
 *   from the caller.
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
 * @property {boolean | BsTableKeyboardOptions} [keyboard] - Opt-in grid keyboard
 *   navigation (F130): the table takes **one** position in the page's tab order
 *   and the arrow keys move a *cell* focus inside it, which is what the ARIA grid
 *   pattern asks for and what a keyboard user needs before the F99 grip or the
 *   F100 handle is reachable in a realistic table. Opt-in for the same reason
 *   `sticky`, `resize`, `reorder` and `selection` are: a table that does not want
 *   a single tab stop must not silently get one.
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
 * @property {boolean | BsTableColumnChooserOptions<Row>} [columns] - The F129
 *   column chooser: one checkbox per **hideable** column, in the header band,
 *   writing through the very commands a caller could call — `showColumn`,
 *   `hideColumn` — so there is one way for a column to become hidden and not
 *   two. Native checkboxes, so the keyboard path is the platform's rather than
 *   ours; the change is announced through an F110 live region (NFR-49). The
 *   checkbox of the **last visible** column is `disabled`, which is how the
 *   chooser refuses an empty table without making the user discover a refusal.
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
 * @property {Element} [columns] - The F129 chooser's group element.
 */

/**
 * @template Row
 * @typedef {object} BsTableColumnChooserOptions
 * @property {string} [label='Columns'] - Accessible name of the group. English,
 *   and injectable for the same reason every other name on this entry is
 *   (NFR-21).
 * @property {(column: BsTableColumn<Row>) => string} [itemLabel] - The visible
 *   text beside each checkbox. Defaults to the column's own label, which is
 *   already a word a user reads.
 * @property {(column: BsTableColumn<Row>, visible: boolean) => string} [announce] -
 *   What the live region says after a toggle. The default is
 *   `<label> shown` / `<label> hidden` — English, so supply this for a UI that
 *   is not.
 * @property {ClassOption} [class] - Extra classes for the group element.
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
 * @typedef {object} BsTableKeyboardOptions
 * @property {number} [pageRows] - Rows moved by `PageUp`/`PageDown`. Omitted, the
 *   jump is **measured**: the scroll container's height divided by a row's, read
 *   once per key press rather than per frame, which is the F98/F99 rule about
 *   layout reads applied to a keyboard. Where there is no layout to read — jsdom,
 *   a detached tree, a server render — it falls back to 10, and a caller who
 *   wants a fixed jump says so here.
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
 * @property {() => string[]} getHiddenColumns - The keys currently hidden, in
 *   **declaration** order (F128). The query half of the visibility pair, and the
 *   value the F92 URL state carries: the hidden set is the deviation from the
 *   default, so a table showing everything serializes to nothing at all.
 * @property {(key: string) => void} showColumn - Reveal a column, with the
 *   filter, sort, width and position it had before it was hidden.
 * @property {(key: string) => void} hideColumn - Hide a column. A `TypeError`
 *   for a key this table does not have, and a `TypeError` for the **last visible
 *   column** — a table with nothing in it is a state no caller means to reach and
 *   the F129 chooser never offers.
 * @property {(key: string) => void} toggleColumn - Hide it if shown, show it if
 *   hidden. The same two refusals as {@link BsTableInstance.hideColumn}.
 * @property {(listener: (key: string, visible: boolean) => void) => (() => void)} onColumnVisibility -
 *   Subscribe to visibility changes — the chooser's, and the caller's own
 *   commands alike. Returns its own unsubscribe. This is what lets
 *   `bindTableHistory` put visibility in the URL (F93): a toggle emits no
 *   pipeline `'change'`, because the derivation never learns about it.
 * @property {() => void} destroy
 */

/** Alignment values, checked so a typo cannot ship a silently unaligned column. */
const ALIGNMENTS = /* @__PURE__ */ new Set(['start', 'center', 'end']);

/**
 * What counts as a tab stop inside a cell (F130-F131).
 *
 * `[tabindex]` rather than `[tabindex="0"]` on purpose: a caller's positive
 * `tabindex` is a tab stop too, and a worse one. The list is the platform's
 * focusable set minus the things a table cell does not contain — no `iframe`, no
 * `audio`/`video` controls, no `contenteditable` — because a selector that has to
 * be read is better short than exhaustive, and anything it misses keeps the
 * behaviour tables have today rather than gaining a broken one.
 */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * Rows `PageUp`/`PageDown` moves where there is no layout to measure — jsdom, a
 * detached tree, a server render. A number, because the alternative is a `0` that
 * makes the key silently do nothing.
 */
const DEFAULT_PAGE_ROWS = 10;

/**
 * Take the tab stops out of one row's cells, leaving them reachable by script.
 *
 * The grid pattern's central claim is *one* tab stop; a table with a checkbox per
 * row and two grips per column has hundreds. `tabindex="-1"` is what turns each
 * of them from a stop in the page's tab order into something `Enter` on its cell
 * reaches (F131) — the control is exactly as operable, and it is no longer in the
 * way of a user tabbing past the table.
 *
 * The caller's own controls are demoted too. That is deliberate rather than
 * overreach: the pattern is about the table, not about who authored what sits
 * inside it, and a row-action button that stayed a tab stop would break the one
 * promise F130 makes. It happens only under `keyboard`, which is opt-in.
 *
 * @param {Element} row
 * @returns {void}
 */
function demoteTabStops(row) {
  // One query per row rather than per cell: the rows are the render's unit, and
  // this runs inside the loop that builds them.
  for (const control of row.querySelectorAll(FOCUSABLE)) {
    control.setAttribute('tabindex', '-1');
  }
}

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
    keyboard: keyboardOption,
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
      visible,
      hideable,
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
    // `resizable`, `movable`, `visible` and `hideable` are read by the
    // destructuring above and nowhere else: like `sortable` and `searchable`
    // beside them, a boolean flag has no malformed value worth a message that
    // `Boolean(x)` would not already explain.
    void resizable;
    void movable;
    void visible;
    void hideable;
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

  // --- grid keyboard navigation (F130-F131) ---------------------------------
  /** @type {BsTableKeyboardOptions} */
  let keyboardConfig = {};
  const wantsKeyboard = keyboardOption !== undefined && keyboardOption !== false;
  if (wantsKeyboard && keyboardOption !== true) {
    assertPlainObject(keyboardOption, 'options.keyboard', api);
    keyboardConfig = /** @type {BsTableKeyboardOptions} */ (keyboardOption);
  }
  const { pageRows, ...unknownKeyboard } = keyboardConfig;
  if (wantsKeyboard) {
    assertNoUnknownOptions(unknownKeyboard, `${api}.keyboard`);
    if (
      pageRows !== undefined &&
      (!Number.isInteger(pageRows) || /** @type {number} */ (pageRows) < 1)
    ) {
      throw new TypeError(`${api}: options.keyboard.pageRows must be an integer >= 1`);
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

  // --- display model: order (F100) and visibility (F128) ---------------------
  //
  // Two facts about *rendering*, and neither of them reaches `/table`. Which
  // column a filter or a sort addresses has nothing to do with where that column
  // is drawn, and nothing to do with whether a viewer can see it — so the F42
  // derivation is never told either one. That split is not tidiness: it is what
  // makes "hiding the column a table is sorted by does not clear the sort" true
  // by construction rather than by care, and what lets a hidden column keep its
  // filter, its width and its position while it is away.

  /** Column keys in display order. Identity until something moves it. */
  let order = columns.map((column) => column.key);
  /** Every key this table knows, for the commands that must reject the others. */
  const columnKeys = new Set(order);
  /**
   * The columns in display order — before visibility is applied.
   *
   * Kept as its own array rather than derived per render: a re-render caused by a
   * pipeline change has to produce the *current* order, and reading it from one
   * place is what makes that true without `renderBody` knowing F100 exists.
   *
   * @type {readonly BsTableColumn<Row>[]}
   */
  let orderedColumns = columns;
  /** Keys hidden right now. The caller's `visible: false` is the starting set. */
  const hidden = new Set(
    columns.filter((column) => column.visible === false).map((column) => column.key),
  );
  /**
   * The columns a render actually iterates: display order, minus what is hidden.
   *
   * @type {readonly BsTableColumn<Row>[]}
   */
  let shownColumns = columns.filter((column) => !hidden.has(column.key));

  /**
   * Every node whose children mirror the columns one-for-one — the header row,
   * F99's `<colgroup>`, F67's filter row — with the cell each column owns in it.
   *
   * Registered rather than discovered, because the three differ in what precedes
   * the column cells: the header and the `<colgroup>` carry an F95 selection cell
   * and the filter row a spacer, and a query that had to tell those apart would
   * be the fragile half of this feature. Body rows are deliberately absent: they
   * are rebuilt per render, so hiding a column reaches them for free.
   *
   * @type {{ parent: Element, cells: Map<string, Element> }[]}
   */
  const mirrors = [];

  /**
   * Recompute what a render iterates, and move every mirror's cells to match.
   *
   * A hidden cell is **removed**, not styled away: `display: none` would leave it
   * in the accessibility tree's row count and in every `querySelector` a caller
   * writes, which is a table that says one thing and shows another. The nodes
   * themselves are kept — `cells` still holds them — so showing a column re-inserts
   * the very `<th>` that carries its F99 grip and its F100 handle.
   *
   * `append` of a node already in the tree **moves** it, so one pass in display
   * order both re-inserts what came back and re-sorts what stayed, without
   * touching the leading selection cell that is not a column's.
   *
   * @returns {void}
   */
  const applyLayout = () => {
    shownColumns = orderedColumns.filter((column) => !hidden.has(column.key));
    const shown = shownColumns.map((column) => column.key);
    for (const { parent, cells } of mirrors) {
      for (const [key, cell] of cells) if (hidden.has(key)) cell.remove();
      parent.append(...shown.map((key) => /** @type {Element} */ (cells.get(key))));
    }
  };

  /** @type {Set<(key: string, visible: boolean) => void>} */
  const visibilityListeners = new Set();

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
  mirrors.push({
    parent: headRow,
    cells: new Map(columns.map((column, index) => [column.key, headerCells[index]])),
  });

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
      // A hidden column has no `<th>` in the document to measure (F128 removes
      // the cell rather than styling it away), so pinning it here would freeze it
      // at its floor and it would come back 48 px wide. It takes its width when
      // it is shown instead — unless the caller declared one, which needs no
      // layout to read.
      if (hidden.has(key) && !columnWidths.has(key)) continue;
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
      // A column hidden before it ever took a width has none to report, and `0`
      // is not one: `setColumnWidths` rejects it, so reporting it would make the
      // round-trip this function exists for throw. Omitted instead — the restore
      // side is partial by contract.
      if (hidden.has(key) && !columnWidths.has(key)) continue;
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
    /** @type {Map<string, Element>} */
    const colOf = new Map();
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
        // A tab stop of its own, unless F130 owns the tab order — in which case
        // one grip per column would be one tab stop per column, which is the
        // thing that pattern exists to prevent. Reachable by entering the header
        // cell instead (F131), and its arrow keys are unchanged either way.
        grip.setAttribute('tabindex', wantsKeyboard ? '-1' : '0');
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
      colOf.set(column.key, col);
      if (column.width !== undefined) columnWidths.set(column.key, column.width);
      colgroup.append(col);
    }
    mirrors.push({ parent: colgroup, cells: colOf });
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

  if (wantsReorder) {
    /** @type {Map<string, Element>} */
    const headerOf = new Map(columns.map((column, index) => [column.key, headerCells[index]]));
    /** @type {Map<string, BsTableColumn<Row>>} */
    const columnOf = new Map(columns.map((column) => [column.key, column]));

    /**
     * Rearrange one body row's cells into `from`, an array of source indices.
     *
     * The leading offset is **computed per row** rather than passed in: a body
     * row carries the F95 selection cell and the empty-state row is a single
     * `colspan` cell that must be left alone. `kids.length - from.length` tells
     * those apart without this function knowing which is which — the same
     * arithmetic that made the filter row's own leading cell a non-event
     * (BUG-0005), back when the head was permuted here too rather than through
     * the mirror registry.
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
      // Over the **visible** columns, because those are the cells a row actually
      // has: a hidden column contributes no `<td>`, so an index computed over the
      // full order would shift every cell after it one slot to the left (F128).
      const before = order.filter((key) => !hidden.has(key));
      const from = next.filter((key) => !hidden.has(key)).map((key) => before.indexOf(key));
      for (const tr of tbody.children) permute(tr, from);
      order = [...next];
      orderedColumns = next.map((key) => /** @type {BsTableColumn<Row>} */ (columnOf.get(key)));
      // The header row, F99's `<colgroup>` and F67's filter row are registered
      // mirrors, and one pass over them re-sorts what is there in the same move
      // that would re-insert what came back — so this is the whole of what F100
      // has to say about the head.
      applyLayout();
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
      // Stepping **over** hidden columns rather than into them: a slot nobody can
      // see is not a slot, and an arrow press that visibly does nothing is how a
      // keyboard path stops being one (F128).
      let to = at + delta;
      while (to >= 0 && to < order.length && hidden.has(order[to])) to += delta;
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
      handle.setAttribute('tabindex', wantsKeyboard ? '-1' : '0');
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
      // Visible columns only, and in display order: a hidden header is not in the
      // document, so measuring it would put a `0` between two real neighbours and
      // make the next swap threshold nonsense.
      headerWidths = order
        .filter((key) => !hidden.has(key))
        .map((key) => /** @type {any} */ (headerOf.get(key)).getBoundingClientRect().width);
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
        const shown = order.filter((key) => !hidden.has(key));
        const at = shown.indexOf(drag.key);
        // **Displacement**, not absolute position: how far the pointer has
        // travelled since the gesture began, against half the neighbour's width.
        // Measuring from the pointer's own start is what makes the grab point
        // irrelevant — the handle sits on the leading edge, so an absolute rule
        // would have made a one-slot move cost the column's own width plus half
        // the neighbour's, which is not a gesture anybody would guess.
        const travelled = /** @type {any} */ (event).clientX - drag.from;
        // `Infinity` at the ends: a column at the edge has no neighbour to pass,
        // and no threshold can be crossed.
        const ahead = at < shown.length - 1 ? headerWidths[at + 1] : Number.POSITIVE_INFINITY;
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
   * Put the roving tab stop back after a render, when F130 is on.
   *
   * A holder rather than a direct call, because the navigation is installed
   * further down — it has to see the F99 grips and the F100 handles first — and a
   * table without `keyboard` should pay one no-op call per render rather than a
   * branch in three places.
   *
   * @type {() => void}
   */
  let refreshRoving = () => {};

  /**
   * Row activation, as F130 reaches it: `null` until `onRowClick` publishes it
   * below. Declared here because the block that assigns it runs first.
   *
   * @type {((event: Event, rowEl: Element) => void) | null}
   */
  let activateFromCell = null;

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
        // The selection column counts, and a hidden one does not: a colspan
        // short by one leaves the empty message hanging under the wrong headers,
        // and one too long stretches it past the table's last column (F128).
        td.setAttribute('colspan', String(shownColumns.length + (selection === undefined ? 0 : 1)));
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
    // The cell that held the tab stop was just replaced, so the grid would have
    // none at all — and a grid with no tab stop is unreachable.
    refreshRoving();
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
    //
    // Not under F130: one tab stop per row is what the grid pattern replaces,
    // and `Enter` on a cell activates the row there instead.
    if (interactive && !wantsKeyboard) tr.setAttribute('tabindex', '0');

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

    for (const column of shownColumns) {
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
    // One query per row, not per cell, and only under F130: a grid with a tab
    // stop per control is not a grid. This takes the caller's own controls too —
    // a link a `format` returned, a row-action button — because the pattern is
    // about the table and not about who authored what is in it. `Enter` on the
    // cell is how each of them is reached (F131).
    if (wantsKeyboard) demoteTabStops(tr);
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
    // Published to F130, which activates a row from the cell that holds focus
    // rather than from the row itself — the row is no longer a tab stop there.
    activateFromCell = activate;

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

  // --- column visibility commands (F128) ------------------------------------
  //
  // One chokepoint, and both the chooser and the caller's own calls go through
  // it, so there is one way a column becomes hidden rather than two that have to
  // agree.

  /**
   * Hide or show one column, and rebuild the body around the result.
   *
   * The body **is** re-rendered, unlike a resize or a reorder — and that is the
   * honest cost rather than an oversight: adding or removing a `<td>` per row is
   * a structural change, and the alternative every grid reaches for,
   * `display: none`, leaves the cell in the accessibility tree and in every
   * `querySelector` a caller writes. A visibility toggle is a user pressing a
   * checkbox, not a frame of a drag, so O(page) once is a price nobody can feel.
   *
   * Nothing here touches the pipeline. The filter, the search, the sort, the page
   * — and F99's width and F100's position — are all untouched by construction,
   * which is why hiding the column a table is sorted by leaves the rows in that
   * order.
   *
   * @param {string} key
   * @param {boolean} next - `true` hides.
   * @param {string} method - The command the caller invoked, for the message.
   * @returns {void}
   */
  const setColumnHidden = (key, next, method) => {
    if (!columnKeys.has(key)) {
      throw new TypeError(`${api}: ${method}() names no such column '${key}'`);
    }
    if (hidden.has(key) === next) return;
    if (next && columns.length - hidden.size === 1) {
      throw new TypeError(
        `${api}: ${method}() would hide '${key}', the last visible column — a table showing ` +
          'nothing is a state the F129 chooser refuses rather than offers, and so does this',
      );
    }
    if (next) hidden.add(key);
    else hidden.delete(key);
    applyLayout();
    // A column shown after F99 pinned the layout carries no declared width, and
    // under `table-layout: fixed` a column with none takes an equal share of what
    // is left — a returning column four times the size of its neighbours.
    // Measuring it here, after re-insertion and before anyone reads the table, is
    // what makes it come back the width the engine would have chosen.
    if (!next && pinned && resizeState.has(key) && !columnWidths.has(key)) {
      applyWidth(key, measureWidth(/** @type {ResizeEntry} */ (resizeState.get(key)).th));
    }
    renderBody(pipeline.view());
    reflectSelection();
    // Copied, because a listener that unsubscribes itself would otherwise mutate
    // the set being iterated — the F41 emitter's rule, applied to a set of two.
    for (const listener of [...visibilityListeners]) listener(key, !next);
  };

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
          // The F129 chooser writes through the same chokepoint a caller's
          // `hideColumn` does, and reads the same set — it owns no state of its
          // own, which is what keeps the two from disagreeing.
          visibility: {
            isHidden: (key) => hidden.has(key),
            canHide: () => columns.length - hidden.size > 1,
            toggle: (key) => setColumnHidden(key, !hidden.has(key), 'toggleColumn'),
            subscribe: (listener) => {
              visibilityListeners.add(listener);
              return () => visibilityListeners.delete(listener);
            },
          },
        });
  if (wired !== null) element = wired.element;
  // Registered after the controls are built, because the F67 filter row is one of
  // the nodes that mirrors the columns and it does not exist until now.
  if (wired?.filterCells !== undefined) {
    mirrors.push({ parent: wired.filterCells.parent, cells: wired.filterCells.cells });
  }
  // --- grid keyboard navigation (F130-F131) ---------------------------------
  //
  // Installed here, after the F99 grips, the F100 handles and the F67 filter row
  // exist, because the first thing it does is take their tab stops away. That
  // ordering is the feature: a table with resize and reorder on twelve columns
  // has twenty-four tab stops before this runs and **one** after it, and all
  // twenty-four are reached through the grid instead (F131).
  //
  // Everything below is `tabindex` and `focus()`. The scroll into view is the
  // browser's — `focus()` already does it — and so is what a screen reader reads
  // when a cell takes focus. A rendered highlight of our own would have been a
  // second, competing source of truth for both.
  if (wantsKeyboard) {
    // The ARIA role, on the table and nowhere else. A `<td>` inside a `grid`
    // already exposes as a `gridcell` and a `<tr>` as a `row`, so stamping either
    // per node would be one attribute per cell — O(rows x columns) of writes and
    // of bytes — to say what the mapping says for free.
    table.setAttribute('role', 'grid');
    // The F71 wrapper, when this instance owns one, and this line exists because
    // a three-engine suite said so: **Firefox gives a scrollable container its own
    // place in the tab order**, so `Tab` reached the wrapper and the grid was two
    // tab stops there while Chromium and WebKit made it one. Firefox does that so
    // a keyboard user can scroll a region they could not otherwise reach — a
    // reason that stops applying the moment this navigation exists, because
    // moving the cell focus is what scrolls this container now. An explicit
    // `-1` is how that is declined.
    scrollContainer?.setAttribute('tabindex', '-1');
    // The head's own focusables, once: the grips, the handles, and the F67 filter
    // inputs. The body's are demoted per row as it is built.
    for (const tr of thead.children) demoteTabStops(tr);

    /** Rows the navigation walks: the head's, then the body's, in document order. */
    const rowsOf = () => [...thead.children, ...tbody.children];
    /** @param {Element} tr @returns {Element[]} */
    const cellsOf = (tr) => [...tr.children];

    /**
     * The cell holding the tab stop. Kept as a node rather than as a pair of
     * indices: a re-render replaces the node, and a stale pair would point at
     * whatever moved into that position — the wrong cell, silently.
     *
     * @type {Element | null}
     */
    let active = null;

    /**
     * Give one cell the tab stop, and take it from the last one that had it.
     *
     * @param {Element | null} cell
     * @param {boolean} [move=false] - Whether to move focus there as well.
     * @returns {void}
     */
    const setActive = (cell, move = false) => {
      if (cell === null || cell === undefined) return;
      if (active !== null && active !== cell) active.setAttribute('tabindex', '-1');
      active = cell;
      cell.setAttribute('tabindex', '0');
      // `focus()` scrolls the cell into view on its own, which is the whole
      // reason F130 asks for a roving tabindex rather than a painted highlight.
      if (move) /** @type {any} */ (cell).focus?.();
    };

    refreshRoving = () => {
      // A body render replaces every row, so the node that held the tab stop is
      // gone unless it was in the head. Falling back to the first cell keeps the
      // grid reachable; an active head cell survives, which keeps a user who was
      // reading the header where they were.
      if (active !== null && active.isConnected) return;
      active = null;
      setActive(rowsOf()[0]?.children[0] ?? null);
    };

    /**
     * How many rows `PageUp`/`PageDown` moves.
     *
     * Measured once per key press, never per frame — the F98/F99 rule about
     * layout reads, applied to a keyboard. Where there is no layout to read the
     * answer is a documented constant rather than a zero that would make the key
     * do nothing at all.
     *
     * @returns {number}
     */
    const pageStep = () => {
      if (pageRows !== undefined) return pageRows;
      const rowHeight = Math.round(
        /** @type {any} */ (tbody.children[0])?.getBoundingClientRect?.().height ?? 0,
      );
      const viewport = Math.round(
        /** @type {any} */ (scrollContainer ?? table)?.getBoundingClientRect?.().height ?? 0,
      );
      if (rowHeight <= 0 || viewport <= 0) return DEFAULT_PAGE_ROWS;
      return Math.max(1, Math.floor(viewport / rowHeight));
    };

    /**
     * Move the cell focus, clamping at every edge.
     *
     * Clamping is what makes F130's "the navigation does not turn pages" true:
     * there is no branch that reaches for the next page, because an arrow key
     * that fetches data is a surprise. A row shorter than the one above it — the
     * empty-state row is a single `colspan` cell — clamps the column too, rather
     * than landing on nothing.
     *
     * @param {number} rowDelta
     * @param {number} colDelta
     * @param {'row' | 'grid' | null} [edge] - `'row'` for `Home`/`End`, `'grid'`
     *   for the `Ctrl` pair, `null` for an ordinary step.
     * @returns {void}
     */
    const move = (rowDelta, colDelta, edge = null) => {
      if (active === null) return;
      const rows = rowsOf();
      const tr = /** @type {Element} */ (active.parentElement);
      const rowAt = rows.indexOf(tr);
      if (rowAt === -1) return;
      const colAt = cellsOf(tr).indexOf(active);

      let nextRow = rowAt;
      if (edge === 'grid') nextRow = rowDelta < 0 ? 0 : rows.length - 1;
      else if (edge === null) nextRow = Math.min(rows.length - 1, Math.max(0, rowAt + rowDelta));

      const cells = cellsOf(rows[nextRow]);
      if (cells.length === 0) return;
      const wanted = edge === null ? colAt + colDelta : colDelta < 0 ? 0 : cells.length - 1;
      setActive(cells[Math.min(cells.length - 1, Math.max(0, wanted))], true);
    };

    table.addEventListener(
      'keydown',
      (event) => {
        const target = /** @type {Element | null} */ (event.target);
        if (target === null) return;
        const pressed = /** @type {KeyboardEvent} */ (event).key;

        // Inside an entered cell the keyboard is the control's, not ours — `Tab`
        // included, which is F131's requirement and is met by doing nothing at
        // all. `Escape` is the way back out, and the only key taken there. This
        // is also what leaves the F99 grip and the F100 handle their own arrow
        // keys: the event's target is the widget, never the cell.
        if (target !== active) {
          if (pressed !== 'Escape' || active === null || !active.contains(target)) return;
          event.preventDefault();
          /** @type {any} */ (active).focus?.();
          return;
        }

        const ctrl =
          /** @type {any} */ (event).ctrlKey === true ||
          /** @type {any} */ (event).metaKey === true;
        switch (pressed) {
          case 'ArrowRight':
            move(0, 1);
            break;
          case 'ArrowLeft':
            move(0, -1);
            break;
          case 'ArrowDown':
            move(1, 0);
            break;
          case 'ArrowUp':
            move(-1, 0);
            break;
          case 'Home':
            move(ctrl ? -1 : 0, -1, ctrl ? 'grid' : 'row');
            break;
          case 'End':
            move(ctrl ? 1 : 0, 1, ctrl ? 'grid' : 'row');
            break;
          case 'PageDown':
            move(pageStep(), 0);
            break;
          case 'PageUp':
            move(-pageStep(), 0);
            break;
          case 'Enter': {
            const control = target.querySelector(FOCUSABLE);
            if (control !== null) {
              /** @type {any} */ (control).focus?.();
              break;
            }
            // A cell with no control of its own activates its row, where there
            // is something to activate: F130 took the row's own tab stop away,
            // so this is the keyboard path `onRowClick` has left.
            const tr = target.parentElement;
            if (tr !== null && tr.parentElement === tbody) activateFromCell?.(event, tr);
            break;
          }
          default:
            return;
        }
        // Only for a key this grid consumed. The arrows would scroll the F71
        // wrapper sideways, `Home`/`End` and the page keys would scroll the
        // document, and `Enter` on a cell inside a form would submit it.
        event.preventDefault();
      },
      { signal: controller.signal },
    );

    // A pointer, or a `Tab` pressed inside a cell the user has entered, puts
    // focus somewhere this model did not choose. Following it is what makes
    // `Escape` return to the cell the user is actually in rather than to the last
    // one an arrow key visited.
    table.addEventListener(
      'focusin',
      (event) => {
        const cell = /** @type {any} */ (event.target)?.closest?.('td, th') ?? null;
        if (cell !== null && cell !== active && table.contains(cell)) setActive(cell);
      },
      { signal: controller.signal },
    );
  }

  // The first pass: `visible: false` columns leave the head, the `<colgroup>` and
  // the filter row here, before the body is built without them.
  applyLayout();

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
    // Ours to drop: a listener held past teardown keeps whatever it closed over
    // alive, and there is nothing left here to notify it about.
    visibilityListeners.clear();
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
    // Unconditional, unlike the F99/F100 pairs above: a column carries `visible`
    // whether or not any option was passed, so there is no "asked for it" to
    // gate on — the query answers `[]` for a table nobody has hidden anything in.
    getHiddenColumns: () => columns.filter((column) => hidden.has(column.key)).map((c) => c.key),
    /** @param {string} key */
    showColumn: (key) => {
      if (destroyed) throw new TypeError(`${api}: showColumn() was called after destroy()`);
      setColumnHidden(key, false, 'showColumn');
    },
    /** @param {string} key */
    hideColumn: (key) => {
      if (destroyed) throw new TypeError(`${api}: hideColumn() was called after destroy()`);
      setColumnHidden(key, true, 'hideColumn');
    },
    /** @param {string} key */
    toggleColumn: (key) => {
      if (destroyed) throw new TypeError(`${api}: toggleColumn() was called after destroy()`);
      setColumnHidden(key, !hidden.has(key), 'toggleColumn');
    },
    /** @param {(key: string, visible: boolean) => void} listener */
    onColumnVisibility: (listener) => {
      // A subscription is a command (ADR-0049): it hands out a claim on an
      // instance, and a destroyed instance has none to hand out.
      if (destroyed) throw new TypeError(`${api}: onColumnVisibility() was called after destroy()`);
      if (typeof listener !== 'function') {
        throw new TypeError(`${api}: onColumnVisibility() expects a function`);
      }
      visibilityListeners.add(listener);
      return () => visibilityListeners.delete(listener);
    },
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
 *   visibility: {
 *     isHidden: (key: string) => boolean,
 *     canHide: () => boolean,
 *     toggle: (key: string) => void,
 *     subscribe: (listener: (key: string, visible: boolean) => void) => (() => void),
 *   },
 * }} context
 * @returns {{ element: Element, parts: BsTableControlParts, reflect: (view: any) => void, destroy: () => void, filterCells?: { parent: Element, cells: Map<string, Element> } }}
 * @throws {TypeError} On a malformed control option.
 */
function buildControls(context) {
  const { controls, columns, pipeline, doc, table, thead, pageSize, api, selectionClass } = context;
  const { visibility } = context;
  assertPlainObject(controls, 'options.controls', api);
  const { filterRow, search, pageSize: pageSizeControl, pagination, toolbar } = controls;
  const { columns: columnChooser } = controls;
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
  /**
   * The filter row's per-column cells, handed back so `bsTable` can register it
   * as one of the nodes that mirrors the column order (F100) and the column
   * visibility (F128). Absent when no filter row was asked for.
   *
   * @type {{ parent: Element, cells: Map<string, Element> } | undefined}
   */
  let filterCells;
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

  /** Teardown for the F129 chooser: its live region and its subscription. */
  /** @type {(() => void) | null} */
  let disposeChooser = null;
  if (columnChooser !== undefined && columnChooser !== false) {
    const {
      label: chooserLabel = 'Columns',
      itemLabel,
      announce,
      class: chooserClass,
      ...unknownChooser
    } = columnChooser === true ? {} : opts(columnChooser, 'options.controls.columns', api);
    assertNoUnknownOptions(unknownChooser, api, 'options.controls.columns property');
    for (const [value, name] of [
      [itemLabel, 'itemLabel'],
      [announce, 'announce'],
    ]) {
      if (value !== undefined && typeof value !== 'function') {
        throw new TypeError(`${api}: options.controls.columns.${name} must be a function`);
      }
    }
    if (typeof chooserLabel !== 'string' || chooserLabel === '') {
      throw new TypeError(`${api}: options.controls.columns.label must be a non-empty string`);
    }

    const group = doc.createElement('div');
    // `role="group"` with a name, rather than a `<fieldset>`: a fieldset's legend
    // is the only accessible name browsers agree on, and a visible legend in a
    // toolbar band is a layout this control does not get to impose on a caller.
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', chooserLabel);
    applyClasses(group, ['d-flex', 'flex-wrap', 'align-items-center', 'gap-2'], chooserClass, api);

    /**
     * One checkbox per **hideable** column, keyed for the reflection below.
     *
     * `hideable: false` withholds the control and nothing else — the column is
     * still hidden by `hideColumn`, exactly as `movable: false` still takes a
     * position from `setColumnOrder`. The exemption is from the user.
     *
     * @type {[BsTableColumn<Row>, Element][]}
     */
    const boxes = [];
    for (const column of columns) {
      if (column.hideable === false) continue;
      const wrapper = doc.createElement('div');
      applyClasses(wrapper, ['form-check', 'form-check-inline', 'm-0'], undefined, api);
      const box = doc.createElement('input');
      box.setAttribute('type', 'checkbox');
      box.setAttribute('class', 'form-check-input');
      box.setAttribute('data-egl-column', column.key);
      // A real `<label for>` rather than an `aria-label`: the visible text is the
      // accessible name, so the two cannot drift, and the text is a click target
      // the way every other checkbox on the page is.
      const id = uniqueId(doc, 'egl-col');
      box.setAttribute('id', id);
      const label = doc.createElement('label');
      label.setAttribute('for', id);
      label.setAttribute('class', 'form-check-label');
      label.textContent = itemLabel === undefined ? labelText(column) : itemLabel(column);
      wrapper.append(box, label);
      group.append(wrapper);
      boxes.push([column, box]);
    }

    /**
     * Push the visibility set into the controls.
     *
     * The **last visible** column's box is `disabled`, which is how F129 refuses
     * an empty table: the command behind it throws, and a user who can press a
     * control that throws has been handed a defect rather than a refusal.
     *
     * @returns {void}
     */
    const reflectChooser = () => {
      const canHide = visibility.canHide();
      for (const [column, box] of boxes) {
        const shown = !visibility.isHidden(column.key);
        /** @type {any} */ (box).checked = shown;
        /** @type {any} */ (box).disabled = shown && !canHide;
      }
    };
    reflectChooser();

    // Visually hidden and read aloud (F110): a checkbox announces its own state,
    // and says nothing about the table that changed underneath it. Built here
    // rather than injected, because a control that needs a region to be correct
    // should not depend on the caller having supplied one (NFR-49).
    const announcer = liveRegion({ document: doc });
    const controller = controllerFor(group);
    group.addEventListener(
      'change',
      (event) => {
        const target = /** @type {Element | null} */ (event.target);
        const key = target?.getAttribute?.('data-egl-column');
        if (key === null || key === undefined) return;
        visibility.toggle(key);
      },
      { signal: controller.signal },
    );
    // Through the subscription rather than from the handler above, so a caller's
    // own `hideColumn` moves these checkboxes too — one state, read from one
    // place, which is what "writing through the same commands" has to mean.
    const unsubscribeVisibility = visibility.subscribe((key, visible) => {
      reflectChooser();
      const column = columns.find((candidate) => candidate.key === key);
      if (column === undefined) return;
      announcer.announce(
        announce === undefined
          ? `${labelText(column)} ${visible ? 'shown' : 'hidden'}`
          : announce(column, visible),
      );
    });
    disposeChooser = () => {
      unsubscribeVisibility();
      controller.abort();
      announcer.destroy();
    };
    header.append(group);
    parts.columns = group;
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
    // The cell, not the input: F128 hides a column by removing the cell, and a
    // column with `filterable: false` has a cell and no input.
    /** @type {Map<string, Element>} */
    const filterCellOf = new Map();
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
      filterCellOf.set(column.key, cell);
      row.append(cell);
    }
    thead.append(row);
    filterCells = { parent: row, cells: filterCellOf };
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
    ...(filterCells === undefined ? {} : { filterCells }),
    reflect: (view) => pager?.setView(view),
    destroy: () => {
      unbind();
      pager?.destroy();
      disposeChooser?.();
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
