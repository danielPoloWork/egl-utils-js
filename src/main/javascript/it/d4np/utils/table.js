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
 * @module egl-utils-js/table
 */

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
  const { caseSensitive = false, locale, operators } = options;
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
  const { type = 'auto', direction = 'asc', locale, collator, emptiesLast = true } = options;
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
  const { page = 1, pageSize } = options ?? {};
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
