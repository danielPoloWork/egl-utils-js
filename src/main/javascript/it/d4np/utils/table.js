/**
 * egl-utils-js — tabular query primitives (spec 02 §2 items F33-F35; pure by
 * contract: every function is a function of its arguments alone and never
 * mutates them).
 *
 * These are the three operations every data table needs before it needs a
 * table: turn a typed filter expression into a predicate, turn a column type
 * into a comparison, and slice a page. The spec-03 table pipeline composes them
 * on this same entry; they are useful, and testable, on their own.
 *
 * Two contracts hold throughout (ADR-0021, ADR-0022):
 *
 * - **The filter grammar is total.** Every string compiles to a predicate,
 *   including a half-typed one — a filter box fires on each keystroke, so
 *   "invalid syntax" is a state the user passes *through*, not an error. There
 *   is no `RegExp` anywhere: an expression is parsed by leading token and
 *   evaluated by linear string operations, so a hostile expression cannot cost
 *   more than its length (NFR-09).
 * - **Comparisons are a total order.** Missing values are pinned to one end
 *   regardless of direction, and mixed types order by type before value, so
 *   `Array.prototype.sort` never sees an inconsistent comparator.
 *
 * Locale is opt-in and explicit: without one, numbers are read the way
 * `Number()` reads them, so results never depend on the machine's regional
 * settings.
 *
 * Every options bag on this entry **rejects a key it does not know** with a
 * `TypeError` naming it: the destructuring is the schema (ADR-0047).
 *
 * @module egl-utils-js/table
 */

import { EventEmitter } from './events.js';
import { assertNoUnknownOptions } from './option-keys.js';

// The remote sibling (spec 06 F88–F91, ADR-0062). Kept in its own module so this
// one stays the local pipeline it has always been, and re-exported here because
// `/table` is the entry a consumer imports either from.
export { remotePipeline, tableQuery } from './table-remote.js';

// The addressable-state pair (spec 06 F92). Pure and SSR-safe, so they belong on
// this entry rather than on `/dom`, where the history binding that uses them
// lives (NFR-29).
export { tableStateFromParams, tableStateToParams } from './table-url.js';

// The keyed selection model (spec 06 F94). Owned beside the pipeline and
// importing none of it, which is what lets the same selection serve either
// sibling — or a caller with no pipeline at all.
export { tableSelection } from './table-selection.js';

// CSV serialization (spec 06 F96). Pure and DOM-free — the clipboard half of the
// same feature is `copyToClipboard` on `egl-utils-js/dom` (F97).
export { tableCsv } from './table-csv.js';

/**
 * Expressions longer than this stop being parsed as a grammar and are matched
 * literally (NFR-09). No realistic filter is this long; a pathological one
 * should not get to choose which code path it runs.
 */
const MAX_EXPRESSION_LENGTH = 1024;

/** Type ranks for `'auto'` comparison — mixed values order by rank first. */
const RANK_BOOLEAN = 0;
const RANK_NUMBER = 1;
const RANK_DATE = 2;
const RANK_STRING = 3;

/** @param {unknown} value @param {string} name @returns {asserts value is string} */
function assertString(value, name) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @param {string} name
 * @returns {asserts value is T}
 */
function assertOneOf(value, allowed, name) {
  if (!allowed.includes(/** @type {T} */ (value))) {
    throw new TypeError(`${name} must be one of: ${allowed.join(', ')}`);
  }
}

/** Comparison directions. */
const DIRECTIONS = /** @type {const} */ (['asc', 'desc']);

/** Comparison modes: `'auto'` probes, the rest are declared by the caller. */
const COMPARE_TYPES = /** @type {const} */ (['auto', 'string', 'number', 'date', 'boolean']);

/**
 * The text form of a cell value, for the string-shaped operators.
 *
 * Total by construction: `null`/`undefined` read as `''`, dates as ISO, and a
 * value that cannot be converted at all — a null-prototype object, a symbol, a
 * hostile `toString` — reads as `''` rather than throwing. A filter must never
 * fail because one cell is exotic.
 *
 * @param {unknown} value
 * @returns {string}
 */
function safeText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  try {
    return String(value);
  } catch {
    return '';
  }
}

/** @param {unknown} value @returns {boolean} */
function isNullish(value) {
  return value === null || value === undefined;
}

/** @param {unknown} value @returns {boolean} */
function isEmptyValue(value) {
  return isNullish(value) || safeText(value) === '';
}

/** @param {unknown} value @returns {boolean} */
function isBlankValue(value) {
  return isNullish(value) || safeText(value).trim() === '';
}

/**
 * @typedef {object} NumberSeparators
 * @property {string} group - Thousands separator, `''` when the locale has none.
 * @property {string} decimal - Decimal separator.
 */

/** Locale-independent default: the grammar `Number()` itself accepts. */
const PLAIN_SEPARATORS = /** @type {NumberSeparators} */ ({ group: '', decimal: '.' });

/**
 * Derive the group and decimal separators a locale writes numbers with.
 *
 * Only called when the caller passes a locale — the default stays
 * locale-independent so `'1.5'` cannot mean fifteen on one machine and one and
 * a half on another.
 *
 * @param {string | string[] | undefined} locale
 * @returns {NumberSeparators}
 */
function separatorsFor(locale) {
  if (locale === undefined) return PLAIN_SEPARATORS;
  let group = '';
  let decimal = '.';
  for (const part of new Intl.NumberFormat(locale).formatToParts(12345.6)) {
    if (part.type === 'group') group = part.value;
    else if (part.type === 'decimal') decimal = part.value;
  }
  return { group, decimal };
}

/**
 * Read a value as a finite number, honouring the locale's separators.
 *
 * @param {unknown} value
 * @param {NumberSeparators} separators
 * @returns {number | null} The number, or `null` when the value is not one.
 */
function readNumber(value, separators) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'string') return null;

  let text = value.trim();
  if (text === '') return null; // `Number('')` is 0, which is not what a blank cell means
  if (separators.group !== '') text = text.split(separators.group).join('');
  if (separators.decimal !== '.') text = text.split(separators.decimal).join('.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Cheap ISO-8601 shape check (`YYYY-MM-DD…`) before paying for `Date.parse`.
 * Restricting to ISO keeps parsing deterministic — other formats are
 * implementation-defined.
 *
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeIsoDate(text) {
  if (text.length < 10) return false;
  for (let i = 0; i < 10; i += 1) {
    const code = text.charCodeAt(i);
    if (i === 4 || i === 7) {
      if (code !== 45) return false; // '-'
    } else if (code < 48 || code > 57) {
      return false;
    }
  }
  return !Number.isNaN(Date.parse(text));
}

/**
 * @typedef {object} FilterContext
 * @property {(value: unknown) => string} text - The same total text conversion
 *   the built-in operators use.
 * @property {(value: unknown) => number | null} toNumber - The same
 *   locale-aware numeric reading the built-in comparisons use.
 * @property {boolean} caseSensitive - The compiled filter's case mode.
 * @property {string | string[] | undefined} locale - The locale in force, if any.
 */

/**
 * @callback FilterOperator
 * @param {string} operand - Everything after the token, trimmed.
 * @param {FilterContext} context - Shared helpers, so a custom operator
 *   normalizes values exactly as the built-ins do.
 * @returns {(value: unknown) => boolean} The predicate for this expression.
 */

/**
 * @typedef {object} FilterOptions
 * @property {boolean} [caseSensitive=false] - When `false`, the text operators
 *   compare case-insensitively.
 * @property {string | string[]} [locale] - Enables locale-aware reading of
 *   numeric operands (`'1.234,5'`). Omitted means `Number()` semantics.
 * @property {Record<string, FilterOperator>} [operators] - Custom leading
 *   tokens. Matched before the built-ins, longest token first, so a token may
 *   also override one.
 */

/** @type {(value: unknown) => boolean} */
const matchAll = () => true;

/**
 * Compile a sentinel word (`null`, `empty`, `blank`) to its predicate.
 *
 * @param {string} word
 * @returns {((value: unknown) => boolean) | null} `null` when the word is not a sentinel.
 */
function sentinelPredicate(word) {
  switch (word.toLowerCase()) {
    case 'null':
      return isNullish;
    case 'empty':
      return isEmptyValue;
    case 'blank':
      return isBlankValue;
    default:
      return null;
  }
}

/**
 * Compile a user-typed filter expression into a predicate (spec 02 F33).
 *
 * The grammar, matched on the leading token:
 *
 * | Expression | Matches |
 * |---|---|
 * | `text` | the value contains `text` (the default) |
 * | `=text` | the value equals `text` |
 * | `!=text` | the value does not equal `text` |
 * | `^text` | the value starts with `text` |
 * | `text$` | the value ends with `text` |
 * | `>n` `>=n` `<n` `<=n` | numeric comparison |
 * | `=null` `=empty` `=blank` | the value is missing / has no text / is whitespace |
 * | `!null` `!empty` `!blank` | the negations (also spellable `!=null`, …) |
 *
 * **Total by design** (NFR-09): an empty or whitespace-only expression matches
 * everything, and anything the grammar cannot read — `>abc`, a bare `^`, an
 * expression past 1024 characters — falls back to matching the expression
 * literally as a substring. Nothing throws for a string expression, so a filter
 * box can compile on every keystroke. The three sentinels nest:
 * `null` ⊂ `empty` ⊂ `blank`.
 *
 * The returned predicate is likewise total: any value, including one that
 * cannot be converted to a string, yields `true` or `false` rather than an
 * exception. All normalization happens here, once, not per row.
 *
 * @example
 * const matches = compileFilter('^192.168');
 * rows.filter((row) => matches(row.address));
 *
 * @example
 * compileFilter('>= 100')({ toString: () => '250' }); // true
 * compileFilter('!blank')('   '); // false
 * compileFilter('')(anything); // true — an empty filter filters nothing
 *
 * @example
 * // A custom operator, sharing the built-in normalization:
 * const near = compileFilter('~50', {
 *   operators: {
 *     '~': (operand, { toNumber }) => {
 *       const target = toNumber(operand);
 *       return (value) => {
 *         const n = toNumber(value);
 *         return n !== null && target !== null && Math.abs(n - target) <= 10;
 *       };
 *     },
 *   },
 * });
 *
 * @param {string} expression - The filter text, as typed.
 * @param {FilterOptions} [options]
 * @returns {(value: unknown) => boolean} A reusable predicate.
 * @throws {TypeError} If `expression` is not a string, `caseSensitive` is not a
 *   boolean, `operators` is not an object, or a custom operator is not a
 *   function returning a function.
 */
export function compileFilter(expression, options = {}) {
  assertString(expression, 'expression');
  const { caseSensitive = false, locale, operators, ...unknown } = options;
  assertNoUnknownOptions(unknown, 'compileFilter');
  if (typeof caseSensitive !== 'boolean') {
    throw new TypeError('options.caseSensitive must be a boolean');
  }
  if (operators !== undefined && (typeof operators !== 'object' || operators === null)) {
    throw new TypeError('options.operators must be an object');
  }

  const raw = expression.trim();
  const separators = separatorsFor(locale);
  /** @param {unknown} value @returns {number | null} */
  const toNumber = (value) => readNumber(value, separators);
  /** @param {string} text @returns {string} */
  const fold = (text) => (caseSensitive ? text : text.toLowerCase());
  /** @param {unknown} value @returns {string} */
  const read = (value) => fold(safeText(value));
  /** Literal-substring fallback, the grammar's ground state. */
  const literal = () => {
    const needle = fold(raw);
    return (/** @type {unknown} */ value) => read(value).includes(needle);
  };

  if (raw === '') return matchAll;
  if (raw.length > MAX_EXPRESSION_LENGTH) return literal();

  // Custom tokens first, longest first, so `>>` can exist alongside `>`.
  if (operators) {
    for (const token of Object.keys(operators).sort((a, b) => b.length - a.length)) {
      if (token === '' || !raw.startsWith(token)) continue;
      const factory = operators[token];
      if (typeof factory !== 'function') {
        throw new TypeError(`options.operators['${token}'] must be a function`);
      }
      const predicate = factory(raw.slice(token.length).trim(), {
        text: safeText,
        toNumber,
        caseSensitive,
        locale,
      });
      if (typeof predicate !== 'function') {
        throw new TypeError(`options.operators['${token}'] must return a function`);
      }
      return predicate;
    }
  }

  // Numeric comparisons, longest token first.
  for (const [token, compare] of /** @type {const} */ ([
    ['>=', 1],
    ['<=', -1],
    ['>', 2],
    ['<', -2],
  ])) {
    if (!raw.startsWith(token)) continue;
    const bound = toNumber(raw.slice(token.length).trim());
    if (bound === null) break; // unreadable operand — fall through to literal
    return (value) => {
      const n = toNumber(value);
      if (n === null) return false;
      if (compare === 1) return n >= bound;
      if (compare === -1) return n <= bound;
      return compare === 2 ? n > bound : n < bound;
    };
  }

  // Equality and its negation; the operand may be a sentinel.
  if (raw.startsWith('!=') || raw.startsWith('=')) {
    const negated = raw.charCodeAt(0) === 33; // '!'
    const operand = raw.slice(negated ? 2 : 1).trim();
    const sentinel = sentinelPredicate(operand);
    if (sentinel) {
      return negated ? (value) => !sentinel(value) : sentinel;
    }
    const wanted = fold(operand);
    return negated ? (value) => read(value) !== wanted : (value) => read(value) === wanted;
  }

  // `!null` and friends — the shorthand spelling of `!=null`.
  if (raw.charCodeAt(0) === 33) {
    const sentinel = sentinelPredicate(raw.slice(1).trim());
    if (sentinel) return (value) => !sentinel(value);
  }

  if (raw.charCodeAt(0) === 94 && raw.length > 1) {
    // '^' — prefix
    const prefix = fold(raw.slice(1));
    return (value) => read(value).startsWith(prefix);
  }

  if (raw.charCodeAt(raw.length - 1) === 36 && raw.length > 1) {
    // '$' — suffix
    const suffix = fold(raw.slice(0, -1));
    return (value) => read(value).endsWith(suffix);
  }

  return literal();
}

/**
 * @typedef {object} ComparatorOptions
 * @property {'auto' | 'string' | 'number' | 'date' | 'boolean'} [type='auto'] - How
 *   to read values. `'auto'` probes each value; a declared type coerces, and
 *   values it cannot read are treated as missing.
 * @property {'asc' | 'desc'} [direction='asc'] - Sort direction. It never moves
 *   the missing values — see `emptiesLast`.
 * @property {string | string[]} [locale] - Collation locale, and (for numbers)
 *   the separator convention. Omitted uses the runtime default for collation
 *   and `Number()` semantics for parsing.
 * @property {Intl.Collator} [collator] - A ready-made collator, when the caller
 *   wants different collation options or wants to share one instance.
 * @property {boolean} [emptiesLast=true] - Whether missing values are pinned to
 *   the end (`true`) or the start (`false`) — in both directions.
 */

/**
 * Build a comparison function for a column of values (spec 02 F34).
 *
 * Returns a `(a, b) => number` suitable for `Array.prototype.sort`, and — the
 * part that matters — a **total order** in every mode, so sorting is stable and
 * never depends on the input's original arrangement:
 *
 * - **Missing values are pinned.** `null`, `undefined`, and `''` sort to one end
 *   chosen by `emptiesLast`, *regardless of direction*: reversing a column
 *   should not scatter its blanks through the middle.
 * - **Mixed types order by type, then by value** (booleans, then numbers, then
 *   dates, then text). Comparing pairwise instead would break transitivity on
 *   mixed data and can make `sort` produce garbage.
 * - **Text collates** through `Intl.Collator` with `sensitivity: 'base'` and
 *   `numeric: true`, so `'item 9'` precedes `'item 10'` and case or accents do
 *   not split otherwise-equal values.
 * - In `'number'` and `'date'` mode a value that cannot be read as one is
 *   treated as missing, which keeps the order transitive.
 *
 * **One caveat no comparator can fix:** `Array.prototype.sort` moves `undefined`
 * elements to the end of the array *itself*, without ever calling the
 * comparator. So `emptiesLast: false` pins `null` and `''` to the front, but a
 * literal `undefined` still lands last when you sort in place. Sort a mapped
 * key, or normalize `undefined` to `null`, if that matters.
 *
 * @example
 * rows.sort(comparator({ type: 'number', direction: 'desc' }));
 *
 * @example
 * const byName = comparator({ locale: 'it' });
 * ['Öl', 'Ober', 'oben'].sort(byName); // accent- and case-insensitive
 *
 * @param {ComparatorOptions} [options]
 * @returns {(a: unknown, b: unknown) => number}
 * @throws {TypeError} If `type` or `direction` is not one of its allowed values,
 *   or `emptiesLast` is not a boolean.
 */
export function comparator(options = {}) {
  const {
    type = 'auto',
    direction = 'asc',
    locale,
    collator,
    emptiesLast = true,
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, 'comparator');
  assertOneOf(type, COMPARE_TYPES, 'options.type');
  assertOneOf(direction, DIRECTIONS, 'options.direction');
  if (typeof emptiesLast !== 'boolean') {
    throw new TypeError('options.emptiesLast must be a boolean');
  }

  const sign = direction === 'asc' ? 1 : -1;
  const missingSide = emptiesLast ? 1 : -1;
  /**
   * Apply the direction without ever producing `-0`: equal must be exactly `0`,
   * or `Object.is` comparisons on the result surprise callers.
   *
   * @param {number} result
   * @returns {number}
   */
  const directed = (result) => (result === 0 ? 0 : sign * result);
  const separators = separatorsFor(locale);
  const collate = collator ?? new Intl.Collator(locale, { sensitivity: 'base', numeric: true });

  /**
   * Read a value in the declared mode: a number to compare by, or `null` for
   * "missing", which is what pins it to one end.
   *
   * @param {unknown} value
   * @returns {number | null}
   */
  const readTyped = (value) => {
    if (type === 'number') return readNumber(value, separators);
    if (type === 'date') {
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string' && looksLikeIsoDate(value)) return Date.parse(value);
      return null;
    }
    // boolean
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value === 1 ? 1 : value === 0 ? 0 : null;
    if (typeof value === 'string') {
      const word = value.trim().toLowerCase();
      if (word === 'true') return 1;
      if (word === 'false') return 0;
    }
    return null;
  };

  /**
   * Classify a value for `'auto'` mode. Ranking by type first is what keeps the
   * order transitive when a column holds more than one kind of value.
   *
   * @param {unknown} value
   * @returns {number}
   */
  const rankOf = (value) => {
    if (typeof value === 'boolean') return RANK_BOOLEAN;
    if (typeof value === 'number' || typeof value === 'bigint') return RANK_NUMBER;
    if (value instanceof Date) return RANK_DATE;
    if (typeof value === 'string' && looksLikeIsoDate(value)) return RANK_DATE;
    return RANK_STRING;
  };

  // In a declared numeric/date/boolean mode, "unreadable" already subsumes
  // "empty" — `readTyped` returns null for null, undefined, and '' alike — so
  // one test covers both and an invalid Date is pinned like any other blank.
  const isMissing =
    type === 'auto' || type === 'string'
      ? isEmptyValue
      : (/** @type {unknown} */ value) => readTyped(value) === null;

  return (a, b) => {
    // Missing first: pinned, and deliberately not multiplied by `sign`.
    const aMissing = isMissing(a);
    const bMissing = isMissing(b);
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return 0;
      return (aMissing ? 1 : -1) * missingSide;
    }

    if (type === 'string') return directed(collate.compare(safeText(a), safeText(b)));
    if (type !== 'auto') {
      const left = /** @type {number} */ (readTyped(a));
      const right = /** @type {number} */ (readTyped(b));
      return directed(left < right ? -1 : left > right ? 1 : 0);
    }

    const rankA = rankOf(a);
    const rankB = rankOf(b);
    if (rankA !== rankB) return directed(rankA < rankB ? -1 : 1);
    if (rankA === RANK_STRING) return directed(collate.compare(safeText(a), safeText(b)));

    // Every branch below reads a real number: the date rank only admits valid
    // dates and parseable ISO text (an invalid `Date` stringifies to `''`, so
    // it was already pinned as missing above), and the number rank only admits
    // finite numbers and bigints.
    const read = (/** @type {unknown} */ value) =>
      rankA === RANK_DATE
        ? Date.parse(safeText(value))
        : rankA === RANK_BOOLEAN
          ? value
            ? 1
            : 0
          : Number(value);
    const left = read(a);
    const right = read(b);
    return directed(left < right ? -1 : left > right ? 1 : 0);
  };
}

/**
 * @typedef {object} PaginateOptions
 * @property {number} [page=1] - 1-based page number; clamped into range.
 * @property {number} pageSize - Rows per page; must be a positive integer.
 */

/**
 * @template T
 * @typedef {object} Page
 * @property {T[]} items - The rows on this page (a new array; the input is untouched).
 * @property {number} page - The page actually returned, after clamping.
 * @property {number} pageCount - Total pages; at least 1, so an empty list is "1 of 1".
 * @property {number} total - Length of the input.
 */

/**
 * Slice one page out of a list (spec 02 F35).
 *
 * The page number is **clamped**, never rejected: deleting the last row of the
 * last page, or arriving with a stale page in a URL, should show the nearest
 * real page instead of an empty screen or an exception. An empty list still
 * reports `pageCount: 1`, so a paginator can render "1 of 1" without a special
 * case.
 *
 * @example
 * paginate(rows, { page: 3, pageSize: 25 });
 * // { items: rows.slice(50, 75), page: 3, pageCount: 4, total: 100 }
 *
 * @example
 * paginate(rows, { page: 99, pageSize: 25 }).page; // 4 — clamped, not an error
 *
 * @template T
 * @param {readonly T[]} items - The full list; never mutated.
 * @param {PaginateOptions} options
 * @returns {Page<T>}
 * @throws {TypeError} If `items` is not an array, or `pageSize`/`page` is not a
 *   positive integer (a non-integer page is a programmer error; an out-of-range
 *   one is not).
 */
export function paginate(items, options) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array');
  }
  const { page = 1, pageSize, ...unknown } = options ?? {};
  assertNoUnknownOptions(unknown, 'paginate');
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new TypeError('options.pageSize must be an integer >= 1');
  }
  if (!Number.isInteger(page)) {
    throw new TypeError('options.page must be an integer');
  }

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = page < 1 ? 1 : page > pageCount ? pageCount : page;
  const start = (current - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: current, pageCount, total };
}

/**
 * @template [Row=any]
 * @typedef {object} TableColumn
 * @property {string} key - The row property this column reads, and the name
 *   commands address it by.
 * @property {'auto' | 'string' | 'number' | 'date' | 'boolean'} [type='auto'] - How
 *   values compare when this column is sorted; ignored when `compare` is given.
 * @property {(a: unknown, b: unknown, rowA: Row, rowB: Row) => number} [compare] - A
 *   custom ordering for this column. It receives both the extracted values and
 *   the whole rows, so an ordering may depend on a second field. Direction is
 *   applied by the pipeline (a `desc` sort negates the result), so a custom
 *   comparator only ever describes ascending order.
 * @property {(row: Row) => unknown} [getValue] - Extracts the value to filter,
 *   search, and sort by. Defaults to `row[key]`, so a derived or formatted
 *   column filters on what the user sees rather than on what is stored.
 * @property {boolean} [searchable] - Whether {@link TablePipeline.setSearch}
 *   looks at this column. When no column is marked, every declared column is
 *   searched.
 * @property {boolean} [filterable=true] - When `false`, addressing this column
 *   with {@link TablePipeline.setFilter} is a `TypeError` — a column that
 *   declares itself unfilterable should fail loudly, not silently.
 */

/**
 * @typedef {object} SortEntry
 * @property {string} key - The column to order by.
 * @property {'asc' | 'desc'} direction - Ascending or descending.
 */

/**
 * @template [Row=any]
 * @typedef {object} TablePipelineOptions
 * @property {readonly Row[]} [source=[]] - The rows to derive from. Copied on
 *   entry and never mutated, so later mutation of the caller's array cannot
 *   change the pipeline's state behind its back.
 * @property {readonly TableColumn<Row>[]} [columns] - Column declarations. When
 *   given, they close the key space: addressing an undeclared key is a
 *   `TypeError`. When omitted, any key is accepted and search reads every own
 *   key of each row.
 * @property {number} [pageSize] - Rows per page. Omitted means no pagination:
 *   one page holding everything, which is what a server-side render usually
 *   wants.
 * @property {string | string[]} [locale] - Passed to {@link compileFilter} and
 *   {@link comparator}, so filtering and ordering read numbers and collate text
 *   the same way.
 * @property {Record<string, FilterOperator>} [operators] - Custom leading-token
 *   operators, passed to {@link compileFilter} for **every** string this
 *   pipeline compiles — a column filter and the global search alike. The
 *   vocabulary belongs here rather than at each call site: a project that
 *   defines `~` means it wherever a filter string is typed, and a pipeline whose
 *   `setFilter('x', '~01')` understood the token while its filter box did not
 *   would be two grammars wearing one name (roadmap 15.2, ADR-0040).
 */

/**
 * @template [Row=any]
 * @typedef {object} TableView
 * @property {Row[]} rows - The current page's rows, in derived order. A
 *   snapshot: treat it as read-only.
 * @property {number} total - Rows in the source, before any filtering.
 * @property {number} totalFiltered - Rows surviving filters and search, across
 *   all pages — the number a "showing X of Y" label wants.
 * @property {number} page - The current page, always within `[1, pageCount]`.
 * @property {number} pageCount - Total pages; at least 1.
 * @property {SortEntry[]} sort - The active sort keys, most significant first.
 * @property {Record<string, string | ((value: unknown) => boolean)>} filters - The
 *   active per-column filters, as given.
 * @property {string} search - The active global search text.
 * @property {number | null} pageSize - Rows per page, or `null` when the
 *   pipeline is unpaginated. Added in 19.2 so the read model is complete: a
 *   caller could already see `pageCount`, which is derived from this, but not
 *   the number it was derived from — which made the state unserializable
 *   without tracking a value the pipeline already knew (spec 06 F92). The
 *   remote sibling's view has carried it since 19.1.
 */

/**
 * @template [Row=any]
 * @typedef {object} TablePipeline
 * @property {() => TableView<Row>} view - The derived read model, memoized: two
 *   reads with no command between them return the *identical* object.
 * @property {(rows: readonly Row[]) => void} setSource - Replace the row set.
 * @property {(key: string, filter: string | ((value: unknown) => boolean) | null) => void} setFilter - Set,
 *   replace, or (with `null` or `''`) clear one column's filter.
 * @property {(text: string) => void} setSearch - Set or (with `''`) clear the
 *   global search.
 * @property {(key: string) => void} toggleSort - Advance one column through
 *   ascending, descending, unsorted.
 * @property {(entries: readonly SortEntry[]) => void} setSort - Replace the sort
 *   outright, for multi-key ordering.
 * @property {(page: number) => void} setPage - Move to a page; out-of-range
 *   values clamp when the view derives.
 * @property {(pageSize: number | null) => void} setPageSize - Change the page
 *   size, or pass `null` to stop paginating.
 * @property {(fn: () => void) => void} batch - Run several commands as one
 *   transaction that emits a single `'change'`.
 * @property {(event: 'change', listener: (view: TableView<Row>) => void) => () => void} on - Subscribe;
 *   returns an unsubscribe function.
 * @property {(event: 'change', listener: (view: TableView<Row>) => void) => () => void} once - Subscribe
 *   for one emission.
 * @property {(event: 'change', listener: (view: TableView<Row>) => void) => void} off - Unsubscribe.
 */

/**
 * Validate the column declarations and index them by key.
 *
 * @template Row
 * @param {readonly TableColumn<Row>[] | undefined} columns
 * @returns {Map<string, TableColumn<Row>> | null} `null` when no columns were
 *   declared, which is the "any key goes" mode.
 */
function indexColumns(columns) {
  if (columns === undefined) return null;
  assertArray(columns, 'options.columns');
  /** @type {Map<string, TableColumn<Row>>} */
  const byKey = new Map();
  for (const column of columns) {
    if (column === null || typeof column !== 'object') {
      throw new TypeError('each column must be an object');
    }
    // A column declaration is hand-written configuration, so a mistyped
    // `searchible` is rejected the way a mistyped option is (ADR-0056). Rows are
    // never checked this way: a record legitimately carries keys the library
    // does not model.
    const { key, type, compare, getValue, searchable, filterable, ...unknown } = column;
    assertNoUnknownOptions(unknown, 'tablePipeline', 'column property');
    assertString(key, 'column.key');
    if (type !== undefined) assertOneOf(type, COMPARE_TYPES, 'column.type');
    if (compare !== undefined && typeof compare !== 'function') {
      throw new TypeError('column.compare must be a function');
    }
    if (getValue !== undefined && typeof getValue !== 'function') {
      throw new TypeError('column.getValue must be a function');
    }
    byKey.set(key, column);
  }
  return byKey;
}

/** @param {unknown} value @param {string} name @returns {asserts value is unknown[]} */
function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`);
  }
}

/**
 * @param {unknown} value
 * @param {boolean} [nullable=false] - Whether `null` (meaning "stop paginating")
 *   is accepted alongside a positive integer.
 * @returns {number | undefined}
 */
function normalizePageSize(value, nullable = false) {
  if (value === undefined || (nullable && value === null)) return undefined;
  if (!Number.isInteger(value) || /** @type {number} */ (value) < 1) {
    throw new TypeError('pageSize must be an integer >= 1, or null');
  }
  return /** @type {number} */ (value);
}

/**
 * A table's state, as one owner with pure stages (spec 03 F42, ADR-0034).
 *
 * The problem this solves is composition. Filtering and sorting implemented as
 * two independent widgets each end up owning a copy of the rows, and each
 * rebuilds its copy from the original — so applying one silently discards the
 * other, and the bug only shows when a user does both. Here there is exactly one
 * owner of the row set and one derivation:
 *
 * ```text
 * source -> per-column filters (AND) -> global search (OR) -> sort -> paginate
 * ```
 *
 * Every command is a transaction: it validates, updates state, and emits exactly
 * one `'change'` carrying the derived view — even when it changes two things at
 * once (setting a filter also returns to page 1, because the page the user was
 * on describes a list that no longer exists). {@link TablePipeline.batch} makes
 * several commands one transaction.
 *
 * The view is memoized on an internal version counter, so reading it repeatedly
 * between commands is free, and subscribers that receive it in the `'change'`
 * payload and callers that ask for it get the identical object.
 *
 * **Pure and DOM-free by contract** (NFR-14): the pipeline derives rows and
 * nothing else — no rendering, no listeners, no `document`. It runs unchanged on
 * a server, and `bindTableControls` (F51) is what connects it to inputs.
 *
 * @example
 * const table = tablePipeline({ source: rows, pageSize: 25, columns: [
 *   { key: 'name', searchable: true },
 *   { key: 'ip', compare: (a, b) => ipv4ToKey(a).localeCompare(ipv4ToKey(b)) },
 *   { key: 'seen', type: 'date' },
 * ]});
 * table.on('change', (view) => render(view.rows));
 * table.setFilter('name', '^ada');   // filter and sort compose: neither
 * table.toggleSort('seen');          // discards the other
 *
 * @example
 * // One re-render, not three.
 * table.batch(() => {
 *   table.setSource(freshRows);
 *   table.setFilter('status', '!=archived');
 *   table.setPageSize(50);
 * });
 *
 * @template [Row=any]
 * @param {TablePipelineOptions<Row>} [options]
 * @returns {TablePipeline<Row>}
 * @throws {TypeError} If `source` is not an array, `columns` is malformed, or
 *   `pageSize` is neither a positive integer nor omitted.
 */
export function tablePipeline(options = {}) {
  const {
    source = [],
    columns,
    locale,
    operators,
    pageSize: initialPageSize,
    ...unknown
  } = options ?? {};
  assertNoUnknownOptions(unknown, 'tablePipeline');
  // One compile configuration for every string this pipeline is given, so a
  // filter typed into a box and one set from code cannot speak different
  // grammars (roadmap 15.2, ADR-0040).
  const filterOptions = operators === undefined ? { locale } : { locale, operators };
  assertArray(source, 'options.source');
  const declared = indexColumns(columns);

  /**
   * Columns the global search reads; `null` means "every own key of the row".
   * When no column opts in, every declared column is searched — a search box
   * that silently matches nothing is worse than one that searches too widely.
   */
  const marked = declared && [...declared.values()].filter((column) => column.searchable);
  const searchKeys = declared
    ? marked?.length
      ? marked.map((c) => c.key)
      : [...declared.keys()]
    : null;

  /** @type {Row[]} */
  let rows = source.slice();
  /** @type {Map<string, { filter: string | ((value: unknown) => boolean), predicate: (value: unknown) => boolean }>} */
  const filters = new Map();
  let search = '';
  /** @type {(value: unknown) => boolean} */
  let searchPredicate = matchAll;
  /** @type {SortEntry[]} */
  let sort = [];
  let page = 1;
  let pageSize = normalizePageSize(initialPageSize, true);

  /** @type {EventEmitter<{ change: TableView<Row> }>} */
  const emitter = new EventEmitter();

  let version = 0;
  let cachedVersion = -1;
  /** @type {TableView<Row> | null} */
  let cached = null;

  let depth = 0;
  let pending = false;

  /**
   * Resolve a key against the declared columns.
   *
   * @param {unknown} key
   * @param {boolean} [forFiltering=false]
   * @returns {string}
   */
  function assertKey(key, forFiltering = false) {
    assertString(key, 'key');
    const column = declared?.get(key);
    if (declared && !column) {
      throw new TypeError(`unknown column: ${key}`);
    }
    if (forFiltering && column?.filterable === false) {
      throw new TypeError(`column is not filterable: ${key}`);
    }
    return key;
  }

  /**
   * @param {Row} row
   * @param {string} key
   * @returns {unknown}
   */
  function readValue(row, key) {
    const getValue = declared?.get(key)?.getValue;
    return getValue ? getValue(row) : /** @type {any} */ (row)?.[key];
  }

  /** @param {Row} row @returns {boolean} */
  function passesFilters(row) {
    for (const [key, { predicate }] of filters) {
      if (!predicate(readValue(row, key))) return false;
    }
    return true;
  }

  /** @param {Row} row @returns {boolean} */
  function matchesSearch(row) {
    const keys = searchKeys ?? Object.keys(/** @type {any} */ (row) ?? {});
    for (const key of keys) {
      if (searchPredicate(readValue(row, key))) return true;
    }
    return false;
  }

  /**
   * Build one comparison per sort key, most significant first.
   *
   * Each compares two already-extracted values, and receives the rows only so a
   * custom comparator can look at a second field.
   *
   * @returns {{ key: string, compare: (a: unknown, b: unknown, rowA: Row, rowB: Row) => number }[]}
   */
  function prepareComparisons() {
    return sort.map(({ key, direction }) => {
      const column = declared?.get(key);
      if (column?.compare) {
        const custom = column.compare;
        const sign = direction === 'desc' ? -1 : 1;
        return { key, compare: (a, b, rowA, rowB) => sign * custom(a, b, rowA, rowB) };
      }
      return { key, compare: comparator({ type: column?.type, direction, locale }) };
    });
  }

  /** @returns {TableView<Row>} */
  function derive() {
    let derived = rows;
    /** Whether `derived` is already a private array we may sort in place. */
    let owned = false;

    if (filters.size > 0) {
      derived = derived.filter(passesFilters);
      owned = true;
    }
    if (search !== '') {
      derived = derived.filter(matchesSearch);
      owned = true;
    }

    const totalFiltered = derived.length;

    if (sort.length > 0) {
      const comparisons = prepareComparisons();
      const unsorted = owned ? derived : derived.slice();

      // Decorate, sort, undecorate. Reading each sort key once per row rather
      // than once per comparison matters most for a `getValue` column: the
      // caller's function would otherwise run O(n log n) times — on 10k rows
      // that is ~86,000 calls instead of 10,000 (NFR-13).
      const keyed = comparisons.map(({ key }) => unsorted.map((row) => readValue(row, key)));

      const order = [...unsorted.keys()];
      // Sorting positions keeps the sort stable through the undecorate step:
      // equal rows keep their index order, which is their source order.
      order.sort((left, right) => {
        for (let rank = 0; rank < comparisons.length; rank += 1) {
          const result = comparisons[rank].compare(
            keyed[rank][left],
            keyed[rank][right],
            unsorted[left],
            unsorted[right],
          );
          if (result !== 0) return result;
        }
        return 0;
      });

      derived = order.map((index) => unsorted[index]);
      owned = true;
    }

    const paged =
      pageSize === undefined
        ? { items: owned ? derived : derived.slice(), page: 1, pageCount: 1 }
        : paginate(derived, { page, pageSize });

    // Built through `fromEntries` rather than by assignment, because assignment
    // routes through the `__proto__` setter: a column literally keyed
    // `'__proto__'` is held perfectly well by the Map above, applied to the
    // derivation, and then vanished from the read model — the view reporting no
    // filter while the rows were filtered (BUG-0004). `fromEntries` defines own
    // properties, so every key the pipeline accepts is a key the view reports.
    /** @type {Record<string, string | ((value: unknown) => boolean)>} */
    const activeFilters = Object.fromEntries(
      [...filters].map(([key, { filter }]) => [key, filter]),
    );

    return {
      rows: paged.items,
      total: rows.length,
      totalFiltered,
      page: paged.page,
      pageCount: paged.pageCount,
      sort: sort.map((entry) => ({ ...entry })),
      filters: activeFilters,
      search,
      pageSize: pageSize ?? null,
    };
  }

  /** @returns {TableView<Row>} */
  function view() {
    if (cached !== null && cachedVersion === version) return cached;
    cached = derive();
    cachedVersion = version;
    return cached;
  }

  /**
   * Run one state change as a transaction: mutate, invalidate, announce.
   *
   * Inside a {@link batch} the announcement is deferred to the outermost close,
   * which is what makes a batch exactly one `'change'`.
   *
   * @param {() => void} mutate
   * @returns {void}
   */
  function commit(mutate) {
    mutate();
    version += 1;
    if (depth > 0) {
      pending = true;
      return;
    }
    emitter.emit('change', view());
  }

  return {
    view,

    setSource(next) {
      assertArray(next, 'rows');
      commit(() => {
        rows = next.slice();
        page = 1;
      });
    },

    setFilter(key, filter) {
      const resolved = assertKey(key, true);
      if (filter !== null && filter !== undefined && typeof filter !== 'string') {
        if (typeof filter !== 'function') {
          throw new TypeError('setFilter(key, filter) requires a string, a function, or null');
        }
      }
      commit(() => {
        if (filter === null || filter === undefined || filter === '') {
          filters.delete(resolved);
        } else {
          filters.set(resolved, {
            filter,
            predicate: typeof filter === 'function' ? filter : compileFilter(filter, filterOptions),
          });
        }
        page = 1;
      });
    },

    setSearch(text) {
      assertString(text, 'text');
      commit(() => {
        search = text;
        searchPredicate = text === '' ? matchAll : compileFilter(text, filterOptions);
        page = 1;
      });
    },

    toggleSort(key) {
      const resolved = assertKey(key);
      commit(() => {
        const [primary] = sort;
        sort =
          primary?.key === resolved
            ? primary.direction === 'asc'
              ? [{ key: resolved, direction: 'desc' }]
              : []
            : [{ key: resolved, direction: 'asc' }];
        page = 1;
      });
    },

    setSort(entries) {
      assertArray(entries, 'entries');
      const next = entries.map((entry) => {
        if (entry === null || typeof entry !== 'object') {
          throw new TypeError('each sort entry must be an object');
        }
        const key = assertKey(entry.key);
        assertOneOf(entry.direction, DIRECTIONS, 'entry.direction');
        return { key, direction: entry.direction };
      });
      commit(() => {
        sort = next;
        page = 1;
      });
    },

    setPage(next) {
      if (!Number.isInteger(next)) {
        throw new TypeError('setPage(page) requires an integer');
      }
      commit(() => {
        page = next;
      });
    },

    setPageSize(next) {
      const size = normalizePageSize(next, true);
      commit(() => {
        pageSize = size;
        page = 1;
      });
    },

    batch(fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('batch(fn) requires a function');
      }
      depth += 1;
      try {
        fn();
      } finally {
        depth -= 1;
        // Announce even when `fn` threw: commands that ran before the throw did
        // change the state, and a subscriber left showing the old one is worse
        // than one that sees a partial update it can re-derive from.
        if (depth === 0 && pending) {
          pending = false;
          emitter.emit('change', view());
        }
      }
    },

    // Delegation, not inheritance: `emit` stays inside the closure, so a
    // subscriber cannot announce a state change the pipeline did not make.
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
  };
}
