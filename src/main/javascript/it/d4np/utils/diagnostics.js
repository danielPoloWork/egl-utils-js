/**
 * egl-utils-js — diagnostics utilities (spec §2 items 20, 25; spec 02 §2 items
 * F36-F37; pure by contract: timing a function never changes what it returns or
 * throws, and normalizing an error never alters or consumes it).
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

/**
 * The units in the order `formatDuration` emits them — descending by rank,
 * which is the one order `parseDuration` accepts (ADR-0009). Written as a
 * literal rather than derived from `UNITS` at module scope: a computed
 * top-level expression is not statically analyzable as side-effect-free, so a
 * bundler retains this whole module in every root import and NFR-02
 * tree-shaking silently regresses. The round-trip property test is what keeps
 * this list honest against `UNITS`.
 */
const UNITS_DESCENDING = /** @type {const} */ (['h', 'm', 's']);

/** @param {number} code @returns {boolean} */
function isDigit(code) {
  return code >= 48 && code <= 57; // '0'..'9'
}

/**
 * Read a property without trusting the value: a thrown value may be a proxy or
 * carry a getter that throws, and the normalizer must survive it.
 *
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown} The property, or `undefined` if reading it failed.
 */
function safeRead(value, key) {
  try {
    return /** @type {Record<string, unknown>} */ (value)[key];
  } catch {
    return undefined;
  }
}

/**
 * A short, safe description of a value that carries no `message` of its own.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  // JSON renders a structure usefully, but would wrap a thrown string in
  // quotes — so it is only for composites. `null` is deliberately included:
  // `JSON.stringify(null)` is the string 'null', which is what we want.
  if (typeof value === 'object' || typeof value === 'function') {
    try {
      const json = JSON.stringify(value);
      if (typeof json === 'string') return json;
    } catch {
      // Circular, BigInt, or a throwing toJSON — fall through to String().
    }
  }
  try {
    return String(value);
  } catch {
    return '';
  }
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

/**
 * Format a duration in milliseconds as an `h`/`m`/`s` string (spec 02 F36).
 *
 * The inverse of {@link parseDuration}, and deliberately its exact inverse:
 * output uses the same ADR-0009 grammar — descending units, each at most once,
 * no zero-valued segments — so `parseDuration(formatDuration(ms)) === ms` for
 * every whole number of seconds. That round-trip is a property test, not a
 * hope.
 *
 * Sub-second remainders are **truncated**, so a duration under a second reads
 * as `'0s'` rather than rounding up to a second that did not elapse. Fractional
 * input is accepted precisely so the output of {@link measure} can be handed
 * straight over.
 *
 * @example
 * formatDuration(5_400_000); // '1h30m'
 * formatDuration(61_000); // '1m1s'
 * formatDuration(0); // '0s'
 *
 * @example
 * const { result, ms } = await measure(() => rebuildIndex());
 * log.info(`rebuilt in ${formatDuration(ms)}`); // e.g. 'rebuilt in 2m3s'
 *
 * @param {number} ms - A duration in milliseconds; `0` to `Number.MAX_SAFE_INTEGER`.
 * @returns {string} The canonical duration string; never empty.
 * @throws {TypeError} If `ms` is not a finite number in range (a programmer
 *   error, ADR-0004 split — the grammar has no sign and no infinity).
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > Number.MAX_SAFE_INTEGER) {
    throw new TypeError('ms must be a finite number between 0 and Number.MAX_SAFE_INTEGER');
  }

  let remaining = Math.floor(ms / 1000) * 1000;
  let out = '';
  for (const unit of UNITS_DESCENDING) {
    const unitMs = UNITS[unit].ms;
    const count = Math.floor(remaining / unitMs);
    if (count > 0) {
      out += `${count}${unit}`;
      remaining -= count * unitMs;
    }
  }
  // Every zero-valued segment is omitted, so a sub-second duration would
  // otherwise format as the empty string, which parseDuration rejects.
  return out === '' ? '0s' : out;
}

/**
 * @typedef {object} ErrorRecord
 * @property {string} name - The error's `name`, the constructor's name, or the
 *   capitalized `typeof` for a thrown primitive (`'String'`, `'Null'`, …).
 * @property {string} message - The error's `message`, or a safe description of
 *   whatever was thrown instead.
 * @property {string} [stack] - Present only when the value carried a string stack.
 * @property {string | number} [code] - Stable identifier when the value carried
 *   one: this library's `EGL_*` codes, Node's `ENOENT`-style codes, or a numeric one.
 * @property {number} [status] - Numeric `status` or `statusCode`, for
 *   response-shaped failures.
 * @property {unknown} [detail] - The first of `body`, `data`, or `responseText`
 *   the value carried — the payload behind a failed response.
 * @property {unknown} cause - **The original thrown value, untouched**, so the
 *   record can be logged while the real error is still rethrown.
 */

/**
 * Normalize anything that was thrown into a uniform diagnostic record
 * (spec 02 F37).
 *
 * `catch` blocks receive `unknown`: an `Error`, a string, a rejected response
 * object, `null`, a symbol. Every logger, reporter, and error boundary then
 * re-implements the same defensive shuffle to find a message. This does it
 * once, and is **total** — it never throws, whatever it is handed, including a
 * value whose `message` getter throws or that cannot be stringified at all.
 *
 * It is also non-destructive: the original value is returned as `cause`, so the
 * idiomatic use is to log the record and rethrow the original.
 *
 * @example
 * try {
 *   await api.get('/users');
 * } catch (error) {
 *   log.error(normalizeError(error)); // { name: 'HttpError', status: 503, … }
 *   throw error; // the original, unwrapped
 * }
 *
 * @example
 * normalizeError('boom'); // { name: 'String', message: 'boom', cause: 'boom' }
 * normalizeError(null); // { name: 'Null', message: 'null', cause: null }
 *
 * @param {unknown} value - Anything a `catch` block can receive.
 * @returns {ErrorRecord} A record with the optional fields present only when
 *   the value carried them.
 */
export function normalizeError(value) {
  const isComposite = (typeof value === 'object' && value !== null) || typeof value === 'function';

  const rawName = isComposite ? safeRead(value, 'name') : undefined;
  let name;
  if (typeof rawName === 'string' && rawName !== '') {
    name = rawName;
  } else if (isComposite) {
    const ctor = safeRead(value, 'constructor');
    const ctorName = typeof ctor === 'function' ? safeRead(ctor, 'name') : undefined;
    name = typeof ctorName === 'string' && ctorName !== '' ? ctorName : 'Object';
  } else {
    // A thrown primitive: 'String', 'Number', 'Undefined', 'Null', …
    const kind = value === null ? 'null' : typeof value;
    name = kind.charAt(0).toUpperCase() + kind.slice(1);
  }

  const rawMessage = isComposite ? safeRead(value, 'message') : undefined;

  /** @type {ErrorRecord} */
  const record = {
    name,
    message: typeof rawMessage === 'string' ? rawMessage : describe(value),
    cause: value,
  };

  if (!isComposite) return record;

  const stack = safeRead(value, 'stack');
  if (typeof stack === 'string') record.stack = stack;

  const code = safeRead(value, 'code');
  if (typeof code === 'string' || typeof code === 'number') record.code = code;

  const status = safeRead(value, 'status');
  const statusCode = safeRead(value, 'statusCode');
  if (typeof status === 'number') record.status = status;
  else if (typeof statusCode === 'number') record.status = statusCode;

  // `body` is this library's own HttpError shape; the other two cover the
  // conventions the common HTTP clients use.
  for (const key of ['body', 'data', 'responseText']) {
    const detail = safeRead(value, key);
    if (detail !== undefined) {
      record.detail = detail;
      break;
    }
  }

  return record;
}
