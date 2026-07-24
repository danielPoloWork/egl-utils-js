/**
 * egl-utils-js — diagnostics utilities (spec §2 items 20, 25; pure by
 * contract: timing a function never changes what it returns or throws).
 *
 * @module egl-utils-js/diagnostics
 */

import { DurationParseError } from './errors.js';

/**
 * Milliseconds per duration unit and the unit's rank (spec §2 item 25,
 * ADR-0009). `h > m > s`: segments must appear in strictly descending rank,
 * which pins one canonical spelling per value and turns typos into errors.
 * `d`/`ms` are deliberately absent, and `m` is minutes not months (see ADR).
 */
const UNITS = {
  h: { ms: 3_600_000, rank: 3 },
  m: { ms: 60_000, rank: 2 },
  s: { ms: 1_000, rank: 1 },
};

/** @param {number} code @returns {boolean} */
function isDigit(code) {
  return code >= 48 && code <= 57; // '0'..'9'
}

/**
 * @template T
 * @typedef {object} MeasureResult
 * @property {T} result - `fn`'s return value (awaited, if a promise).
 * @property {number} ms - Elapsed wall-clock time in milliseconds
 *   (`performance.now()` deltas — sub-millisecond resolution, monotonic).
 */

/**
 * Time a function's execution on `performance.now()` (spec §2 item 20).
 *
 * Works uniformly for sync and async `fn`, always returning a `Promise` (the
 * one shape that fits both): a synchronous return resolves `ms` immediately;
 * a returned promise is awaited first, so `ms` covers the full async
 * duration, not just the synchronous portion before the first `await`. Both
 * a synchronous throw and a rejected promise surface as a rejection of
 * `measure`'s own promise, with the original error untouched (no wrapping) —
 * timing is a side channel, never swallowed into the result.
 *
 * @example
 * const { result, ms } = await measure(() => expensiveSort(data));
 *
 * @example
 * const { result, ms } = await measure(() => fetch(url));
 *
 * @template T
 * @param {() => T | Promise<T>} fn - The function to time; called with no arguments.
 * @returns {Promise<MeasureResult<T>>}
 * @throws {TypeError} If `fn` is not a function.
 */
export async function measure(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function');
  }
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  return { result, ms };
}

/**
 * Parse a duration string into milliseconds (spec §2 item 25, ADR-0009).
 *
 * Grammar: one or more `<integer><unit>` segments, units `h`/`m`/`s`
 * (hours/minutes/seconds), in **strictly descending** order with each unit
 * used at most once — so `'2h'`, `'30m'`, `'5s'`, and `'1h30m'` are valid,
 * while `'30m1h'` (out of order) and `'1h1h'` (repeated) are not. Integers
 * are unsigned decimal digits only (no sign, no decimal point). Surrounding
 * whitespace is trimmed; no whitespace is allowed between segments. The
 * result is the sum of each segment's contribution.
 *
 * Invalid input **always throws {@link DurationParseError}** — the function
 * never returns `NaN` (spec F25). Non-string input throws `TypeError`
 * (ADR-0004 split: a programmer error, not a parse failure).
 *
 * `m` is minutes, never months, and `d`/`ms`/`w`/`y` are intentionally
 * unsupported — ADR-0009 records why (the minute/month `M`/`m` ambiguity and
 * the calendar-unit trap).
 *
 * @example
 * parseDuration('1h30m'); // 5_400_000
 * parseDuration('500s');  // 500_000
 *
 * @param {string} input - The duration string to parse.
 * @returns {number} The duration in milliseconds (a safe non-negative integer).
 * @throws {TypeError} If `input` is not a string.
 * @throws {DurationParseError} If `input` is not a valid duration string.
 */
export function parseDuration(input) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string');
  }
  const str = input.trim();
  if (str === '') {
    throw new DurationParseError(`Invalid duration ${JSON.stringify(input)}: empty`, {
      cause: { input },
    });
  }

  let total = 0;
  let lastRank = Infinity; // each unit must have a strictly smaller rank
  let i = 0;
  const n = str.length;

  while (i < n) {
    // Read one or more digits.
    const digitsStart = i;
    while (i < n && isDigit(str.charCodeAt(i))) i += 1;
    if (i === digitsStart) {
      throw new DurationParseError(
        `Invalid duration ${JSON.stringify(input)}: expected a digit at position ${i}`,
        { cause: { input, position: i } },
      );
    }
    const value = Number(str.slice(digitsStart, i));

    // Read exactly one unit character.
    if (i >= n) {
      throw new DurationParseError(
        `Invalid duration ${JSON.stringify(input)}: number without a unit at position ${digitsStart}`,
        { cause: { input, position: digitsStart } },
      );
    }
    const unitChar = str[i];
    const unit = Object.prototype.hasOwnProperty.call(UNITS, unitChar)
      ? UNITS[/** @type {keyof typeof UNITS} */ (unitChar)]
      : undefined;
    if (unit === undefined) {
      throw new DurationParseError(
        `Invalid duration ${JSON.stringify(input)}: unknown unit ${JSON.stringify(unitChar)} at position ${i} (expected h, m, or s)`,
        { cause: { input, position: i } },
      );
    }
    if (unit.rank >= lastRank) {
      throw new DurationParseError(
        `Invalid duration ${JSON.stringify(input)}: unit ${JSON.stringify(unitChar)} at position ${i} is out of order or repeated (units must descend h > m > s, each at most once)`,
        { cause: { input, position: i } },
      );
    }
    lastRank = unit.rank;
    i += 1;

    total += value * unit.ms;
    if (!Number.isSafeInteger(total)) {
      throw new DurationParseError(
        `Invalid duration ${JSON.stringify(input)}: total exceeds the safe integer range`,
        { cause: { input } },
      );
    }
  }

  return total;
}
