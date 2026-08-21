/**
 * egl-utils-js — the table state ↔ query-string pair (spec 06 §2 item F92).
 *
 * A table's state is the question a user asked: which filters, which search,
 * which sort, which page. A URL is where that question belongs, because it is
 * the only part of a page a user can bookmark, reload, or send to a colleague.
 * These two functions move a state between those forms and nothing else.
 *
 * **Pure and SSR-safe.** No `document`, no `location`, no `history`, no `URL`
 * constructor — only `URLSearchParams`, which needs no base and no browser. That
 * is what keeps them on `egl-utils-js/table` (NFR-29): a server render reads the
 * request's query string, restores the state, and derives page 3 before any
 * script runs. The browser half — reading the real URL, writing history entries,
 * following Back — is `bindTableHistory` on `egl-utils-js/dom`, where a DOM
 * dependency is allowed to live.
 *
 * **The two directions are deliberately asymmetric**, because their inputs are.
 * {@link tableStateToParams} is handed a state by the program, so a malformed one
 * is a bug and throws. {@link tableStateFromParams} is handed a query string by
 * whoever last edited the address bar, so a malformed one degrades to the default
 * for that field and never throws: a table that refuses to render because a
 * stranger typed `page=abc` is worse than one that shows page 1.
 *
 * @module egl-utils-js/table
 */

import { assertNoUnknownOptions } from './option-keys.js';

/**
 * The four scalar parameters, and the prefix the per-column filters take.
 *
 * Short names on purpose: these end up in a URL a human reads and retypes. `q`
 * is the web's own convention for a search box, and `size` says what `pageSize`
 * says in four fewer characters.
 */
const SEARCH = 'q';
const SORT = 'sort';
const PAGE = 'page';
const SIZE = 'size';
const FILTER = 'filter.';

/**
 * The state these functions carry, as a plain JSON-safe value.
 *
 * Structurally a subset of `TableView`, which is what makes
 * `tableStateToParams(pipeline.view())` the one-liner it should be — see that
 * function's note on why this argument does *not* reject unknown keys.
 *
 * @typedef {object} TableUrlState
 * @property {Record<string, string | ((value: unknown) => boolean)>} [filters] - Per-column
 *   filter expressions. The union is the one `TableView.filters` has, deliberately:
 *   a view has to be assignable here, and `tablePipeline` accepts a predicate
 *   function as a filter. Only the string half is serializable — a function
 *   throws, at runtime, naming the column. Typing it as string-only would have
 *   moved that failure to compile time for the honest caller while doing nothing
 *   about the plain-JS one, and would have made the primary call site,
 *   `tableStateToParams(pipeline.view())`, a type error.
 * @property {string} [search] - The global search text; `''` when unset.
 * @property {readonly { key: string, direction: 'asc' | 'desc' }[]} [sort] - Sort
 *   keys, most significant first.
 * @property {number} [page] - 1-based.
 * @property {number | null} [pageSize] - `null` means unpaginated.
 */

/**
 * Strip a leading `?` so `location.search` can be passed as-is.
 *
 * @param {string} input
 * @returns {string}
 */
function withoutLeadingMark(input) {
  return input.startsWith('?') ? input.slice(1) : input;
}

/**
 * Remove this binding's prefix from a parameter name.
 *
 * @param {string} name - The raw parameter name.
 * @param {string} prefix
 * @returns {string | null} The unprefixed name, or `null` when the parameter
 *   belongs to someone else.
 */
function unprefixed(name, prefix) {
  if (prefix === '') return name;
  const head = `${prefix}.`;
  return name.startsWith(head) ? name.slice(head.length) : null;
}

/**
 * Whether a parameter is one this state owns — which is exactly the set
 * {@link tableStateToParams} emits, never a name merely sharing the prefix.
 *
 * Ownership decides what a re-serialization is allowed to remove, so it is
 * deliberately narrow: `t.bogus` under prefix `t` is left alone, because nothing
 * here would ever have written it, while `filter.bogus` is removed, because that
 * *is* our shape carrying a column that does not exist.
 *
 * @param {string} name
 * @param {string} prefix
 * @returns {boolean}
 */
function owned(name, prefix) {
  const rest = unprefixed(name, prefix);
  return (
    rest !== null &&
    (rest === SEARCH || rest === SORT || rest === PAGE || rest === SIZE || rest.startsWith(FILTER))
  );
}

/**
 * @param {string} prefix
 * @param {string} name
 * @returns {string}
 */
function prefixed(prefix, name) {
  return prefix === '' ? name : `${prefix}.${name}`;
}

/**
 * Read one `sort` parameter.
 *
 * Split at the **last** colon, not the first, so a column key may itself contain
 * one: `a:b:desc` is the key `a:b` sorted descending. A bare key means ascending,
 * which is what a human editing the address bar writes; a key that contains a
 * colon has to carry its direction, since otherwise the tail would be read as
 * one.
 *
 * @param {string} value
 * @returns {{ key: string, direction: 'asc' | 'desc' } | null} `null` for an
 *   entry this function refuses to guess at.
 */
function readSortEntry(value) {
  const at = value.lastIndexOf(':');
  if (at === -1) return value === '' ? null : { key: value, direction: 'asc' };
  const key = value.slice(0, at);
  const direction = value.slice(at + 1);
  if (key === '') return null;
  if (direction !== 'asc' && direction !== 'desc') return null;
  return { key, direction };
}

/**
 * Read a positive integer, or `null` where the text is not one.
 *
 * @param {string} value
 * @returns {number | null}
 */
function readPositiveInteger(value) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * @typedef {object} TableStateToParamsOptions
 * @property {string} [prefix=''] - Namespaces every parameter this call owns, so
 *   two tables can share one URL: `prefix: 'orders'` writes `orders.page`,
 *   `orders.filter.status`, and so on. With the default empty prefix the names
 *   are bare, which is the readable choice for the usual one-table page — and the
 *   reason a page whose URL already carries its own `page` or `q` should pass a
 *   prefix.
 * @property {string} [base=''] - An existing query string (with or without its
 *   leading `?`) to merge into. Parameters it carries that this state does not
 *   own are **preserved, in their original order**; the ones it does own are
 *   replaced. Passing `location.search` here is what keeps a table's URL from
 *   deleting the rest of the page's.
 */

/**
 * Serialize a table state to a query string (F92).
 *
 * The output is **stable**: the same state produces the same string, byte for
 * byte, with filter keys in sorted order. That is not cosmetic — the history
 * binding compares the serialization against the current URL to decide whether
 * anything needs writing, and an unstable encoding would push a history entry on
 * every change that changed nothing.
 *
 * Default values are **omitted** rather than spelled out: no search, no filters,
 * no sort, page 1 and no page size are the absence of parameters, which is what
 * makes a table at rest have a clean URL and what makes the round-trip exact.
 *
 * @example
 * tableStateToParams({ search: 'ann', sort: [{ key: 'score', direction: 'desc' }], page: 3 });
 * // 'q=ann&sort=score%3Adesc&page=3'
 *
 * @example
 * // A view is accepted directly — it is a superset of the state:
 * tableStateToParams(pipeline.view(), { base: location.search });
 *
 * @example
 * // Two tables, one URL:
 * tableStateToParams(orders.view(), { prefix: 'orders', base: location.search });
 *
 * @param {TableUrlState} state - The state to serialize. Extra properties are
 *   **ignored, not rejected**: the primary call site passes a `view()`, which
 *   carries `rows`, `total` and `pageCount` too, and a strict bag here would
 *   forbid the one call every consumer makes. A deliberate, documented exception
 *   to ADR-0047's unknown-key rule — the `options` bag below is strict as usual.
 * @param {TableStateToParamsOptions} [options]
 * @returns {string} A query string with no leading `?`, ready to append after
 *   one or to hand to `URLSearchParams`.
 * @throws {TypeError} If `state` is not an object, if a field has the wrong type,
 *   or if a filter is a **function**. A predicate is code, and code has no
 *   address: writing a URL that silently dropped it would describe a table other
 *   than the one on screen, and restoring that URL would show different rows.
 *   The same refusal, for the same reason, as `tableQuery` (F90).
 */
export function tableStateToParams(state, options = {}) {
  const api = 'tableStateToParams';
  if (state === null || typeof state !== 'object') {
    throw new TypeError(`${api}: state must be an object`);
  }
  const { prefix = '', base = '', ...unknown } = options ?? {};
  assertNoUnknownOptions(unknown, api);
  if (typeof prefix !== 'string') throw new TypeError(`${api}: options.prefix must be a string`);
  if (typeof base !== 'string') throw new TypeError(`${api}: options.base must be a string`);

  const { filters = {}, search = '', sort = [], page = 1, pageSize = null } = state;
  if (filters === null || typeof filters !== 'object' || Array.isArray(filters)) {
    throw new TypeError(`${api}: state.filters must be an object`);
  }
  if (typeof search !== 'string') throw new TypeError(`${api}: state.search must be a string`);
  if (!Array.isArray(sort)) throw new TypeError(`${api}: state.sort must be an array`);
  if (!Number.isInteger(page) || page < 1) {
    throw new TypeError(`${api}: state.page must be an integer >= 1`);
  }
  if (pageSize !== null && (!Number.isInteger(pageSize) || pageSize < 1)) {
    throw new TypeError(`${api}: state.pageSize must be an integer >= 1, or null`);
  }

  const params = new URLSearchParams(withoutLeadingMark(base));
  // Collected first: deleting while iterating the live view would skip names.
  for (const name of [...new Set(params.keys())]) {
    if (owned(name, prefix)) params.delete(name);
  }

  for (const key of Object.keys(filters).sort()) {
    const value = filters[key];
    if (typeof value === 'function') {
      throw new TypeError(
        `${api}: filter '${key}' is a function, and a URL carries only text — express it as a filter string, or leave this pipeline unbound`,
      );
    }
    if (typeof value !== 'string') {
      throw new TypeError(`${api}: filter '${key}' is a ${typeof value}, and must be a string`);
    }
    // An empty filter is the absence of one — `setFilter(key, '')` clears it — so
    // it is not written, and the round-trip is exact for the state that means.
    if (value !== '') params.append(prefixed(prefix, `${FILTER}${key}`), value);
  }
  if (search !== '') params.append(prefixed(prefix, SEARCH), search);
  for (const [index, entry] of sort.entries()) {
    if (entry === null || typeof entry !== 'object') {
      throw new TypeError(`${api}: state.sort[${index}] must be an object`);
    }
    if (typeof entry.key !== 'string' || entry.key === '') {
      throw new TypeError(`${api}: state.sort[${index}].key must be a non-empty string`);
    }
    if (entry.direction !== 'asc' && entry.direction !== 'desc') {
      throw new TypeError(`${api}: state.sort[${index}].direction must be 'asc' or 'desc'`);
    }
    params.append(prefixed(prefix, SORT), `${entry.key}:${entry.direction}`);
  }
  if (page !== 1) params.append(prefixed(prefix, PAGE), String(page));
  if (pageSize !== null) params.append(prefixed(prefix, SIZE), String(pageSize));

  return params.toString();
}

/**
 * @typedef {object} TableStateFromParamsOptions
 * @property {string} [prefix=''] - The namespace {@link tableStateToParams} was
 *   given. Parameters outside it are ignored.
 */

/**
 * Restore a table state from a query string (F92).
 *
 * **Nothing here throws on the input.** A query string is whatever the last
 * person to touch the address bar left behind, so every field degrades on its
 * own: `page=abc` is page 1, `size=0` is unpaginated, `sort=name:sideways` is
 * dropped while the entries around it survive, and a parameter this call does not
 * recognise is simply not read. Only a wrong *argument type* — a non-string
 * input, a bad option — is a programming error and throws.
 *
 * Where a scalar appears twice the last occurrence wins, which is how a URL built
 * by appending is normally read. `sort` is the exception: it repeats by design,
 * and its entries accumulate in order.
 *
 * @example
 * tableStateFromParams('q=ann&sort=score%3Adesc&page=3');
 * // { filters: {}, search: 'ann', sort: [{ key: 'score', direction: 'desc' }], page: 3, pageSize: null }
 *
 * @example
 * tableStateFromParams('?page=abc&size=-1'); // → page 1, pageSize null. No throw.
 *
 * @param {string} input - A query string, with or without its leading `?`.
 * @param {TableStateFromParamsOptions} [options]
 * @returns {{ filters: Record<string, string>, search: string, sort: { key: string, direction: 'asc' | 'desc' }[], page: number, pageSize: number | null }} A
 *   complete state: every field present, defaulted where the input said nothing
 *   usable.
 * @throws {TypeError} If `input` is not a string, or an option is malformed.
 */
export function tableStateFromParams(input, options = {}) {
  const api = 'tableStateFromParams';
  if (typeof input !== 'string') throw new TypeError(`${api}: input must be a string`);
  const { prefix = '', ...unknown } = options ?? {};
  assertNoUnknownOptions(unknown, api);
  if (typeof prefix !== 'string') throw new TypeError(`${api}: options.prefix must be a string`);

  /**
   * Collected as pairs and defined at the end rather than assigned as we go:
   * `filters[column] = value` routes through `Object.prototype`'s `__proto__`
   * setter, so `?filter.__proto__=x` would have been silently dropped instead of
   * becoming a filter (the same hazard as BUG-0004, from the other direction).
   *
   * @type {[string, string][]}
   */
  const filterEntries = [];
  /** @type {{ key: string, direction: 'asc' | 'desc' }[]} */
  const sort = [];
  let search = '';
  let page = 1;
  /** @type {number | null} */
  let pageSize = null;

  for (const [name, value] of new URLSearchParams(withoutLeadingMark(input))) {
    const key = unprefixed(name, prefix);
    if (key === null) continue;
    if (key === SEARCH) {
      search = value;
    } else if (key === PAGE) {
      page = readPositiveInteger(value) ?? 1;
    } else if (key === SIZE) {
      pageSize = readPositiveInteger(value);
    } else if (key === SORT) {
      const entry = readSortEntry(value);
      if (entry !== null) sort.push(entry);
    } else if (key.startsWith(FILTER)) {
      const column = key.slice(FILTER.length);
      if (column !== '' && value !== '') filterEntries.push([column, value]);
    }
  }

  return { filters: Object.fromEntries(filterEntries), search, sort, page, pageSize };
}
