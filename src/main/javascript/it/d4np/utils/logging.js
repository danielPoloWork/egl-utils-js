/**
 * egl-utils-js — structured logging (spec 02 §2 items F40-F41).
 *
 * Two pure formatters and one stateful factory. `logger` holds configuration —
 * a level threshold, a name, and the injected clock, sink, formatter, and
 * correlation id — and is therefore **stateful by contract**; `formatLogLine`
 * and `formatTimestamp` are pure functions of their arguments.
 *
 * The division of labour is the whole design (ADR-0027): the logger decides
 * *whether* a record is emitted, the sink decides *where* it goes, and the
 * formatter decides *what it looks like*. A sink receives the record plus the
 * configured formatter, so a text sink calls it and a structured sink ignores
 * it — nothing is formatted that nobody reads.
 *
 * One rule outranks the others: **logging never throws into application code**.
 * A failing sink, clock, id function, or `toString` is caught and reported once
 * through `console.error`; the call that logged it still returns normally.
 *
 * Every options bag on this entry **rejects a key it does not know** with a
 * `TypeError` naming it: the destructuring is the schema (ADR-0047).
 *
 * @module egl-utils-js/logging
 */

import { fixedWidth } from './text.js';
import { assertNoUnknownOptions } from './option-keys.js';

/**
 * The level vocabulary, ordered from most to least verbose (spec 02 F40).
 *
 * `'silent'` is a threshold only — there is no `log.silent()` method; setting
 * it suppresses every level.
 *
 * @type {readonly ['trace', 'debug', 'info', 'warn', 'error', 'silent']}
 */
export const LOG_LEVELS = Object.freeze(
  /** @type {const} */ (['trace', 'debug', 'info', 'warn', 'error', 'silent']),
);

/**
 * Severity ranks. A literal object on purpose: a computed map (`LOG_LEVELS`
 * reduced into ranks) is not provably side-effect-free, which would pin this
 * whole module into every bundle that touches the entry (ADR-0019).
 *
 * @type {Record<string, number>}
 */
const RANK = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, silent: 60 };

/**
 * Level to `console` method. `trace` maps to `debug` deliberately —
 * `console.trace` prints a stack trace, which is not what a trace *level*
 * means.
 *
 * @type {Record<string, 'debug' | 'info' | 'warn' | 'error'>}
 */
const CONSOLE_METHOD = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/** Width of the level column — `'ERROR'`, the longest emitted level. */
const LEVEL_WIDTH = 5;

/** Width of the name column; dotted names keep their tail (`truncate: 'start'`). */
const NAME_WIDTH = 20;

/** @param {number} value @param {number} width @returns {string} */
function padZero(value, width) {
  return String(value).padStart(width, '0');
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {asserts value is string}
 */
function assertString(value, name) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {asserts value is Function}
 */
function assertFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
}

/**
 * Report a logging failure without ever letting it escape. Deliberately the one
 * place this module reaches for `console` unconditionally: there is nothing else
 * left to report with once the configured sink is the thing that broke.
 *
 * @param {unknown} failure
 * @returns {void}
 */
function lastResort(failure) {
  try {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error('[egl-utils-js/logging] log record dropped', failure);
    }
  } catch {
    // No console, or a console that throws: drop it. Logging must not escalate.
  }
}

/**
 * Collapse every CR/LF run to a single space, in one pass with no backtracking.
 *
 * Applied to every field interpolated into a line, not just the message: a
 * correlation id comes from an injected function and a name can come from
 * configuration, so treating only the message would leave the forged-line hole
 * half open (ADR-0027).
 *
 * @param {string} value
 * @returns {string}
 */
function oneLine(value) {
  return value.replace(/[\r\n]+/g, ' ');
}

/**
 * @typedef {object} TimestampOptions
 * @property {boolean} [fractional=true] - Include `.SSS` milliseconds.
 */

/**
 * Format an instant as `YYYY-MM-DD HH:mm:ss.SSS` in **local time** (spec 02 F41).
 *
 * Local time because these lines are read by a human next to the process that
 * wrote them; a consumer who needs UTC or ISO-8601 injects their own `format`
 * (or logs `record.ts`, which is plain epoch milliseconds). Without
 * `fractional` the result ends at the seconds digit — there is no trailing
 * separator to trip a log parser.
 *
 * @example
 * formatTimestamp(new Date(2026, 7, 6, 9, 30, 12, 7)); // '2026-08-06 09:30:12.007'
 * formatTimestamp(Date.now(), { fractional: false }); // '2026-08-06 09:30:12'
 *
 * @param {Date | number} date - A `Date`, or epoch milliseconds (what a log
 *   record carries).
 * @param {TimestampOptions} [options]
 * @returns {string}
 * @throws {TypeError} If `date` is neither a `Date` nor a number, or if it does
 *   not represent a real instant (an invalid `Date`, `NaN`, `Infinity`).
 */
export function formatTimestamp(date, options = {}) {
  if (!(date instanceof Date) && typeof date !== 'number') {
    throw new TypeError('date must be a Date or epoch milliseconds');
  }
  const at = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(at.getTime())) {
    throw new TypeError('date must represent a valid instant');
  }
  const { fractional = true, ...unknown } = options;
  assertNoUnknownOptions(unknown, 'formatTimestamp');

  const ymd = `${at.getFullYear()}-${padZero(at.getMonth() + 1, 2)}-${padZero(at.getDate(), 2)}`;
  const hms = `${padZero(at.getHours(), 2)}:${padZero(at.getMinutes(), 2)}:${padZero(at.getSeconds(), 2)}`;
  return fractional ? `${ymd} ${hms}.${padZero(at.getMilliseconds(), 3)}` : `${ymd} ${hms}`;
}

/**
 * @typedef {object} LogRecord
 * @property {number} ts - Epoch milliseconds, from the injected clock.
 * @property {string} level - One of {@link LOG_LEVELS}, never `'silent'`.
 * @property {string} name - The logger's name (`''` when unnamed); a child
 *   logger's name is `'parent.child'`.
 * @property {string} id - The resolved correlation id, or `''` when none is
 *   configured.
 * @property {string} message - The message, already a string.
 * @property {unknown[]} args - Extra arguments, untouched — structured data
 *   belongs here, not interpolated into `message`.
 */

/**
 * Render a record as one aligned line (spec 02 F41).
 *
 * Shape: `ts LEVEL id --- [name] message`. The level and name columns are
 * fixed-width (F28 `fixedWidth`), so consecutive lines from the same logger
 * form readable columns; the `id` and `[name]` groups are omitted entirely
 * when empty rather than padded to blanks, so an unnamed logger produces short
 * lines instead of a wall of spaces. Long dotted names keep their tail
 * (`com.example…` truncates on the left) because the specific part is the
 * informative one.
 *
 * **CR and LF are replaced by a single space — in the message, and in the name
 * and id columns too.** A newline in any of them would let an attacker forge
 * additional log lines (log injection); one record in, exactly one line out is
 * the invariant that makes a log file parseable, and it holds for every input
 * (a property test asserts it over arbitrary strings).
 *
 * @example
 * formatLogLine({ ts: 1_775_000_000_000, level: 'info', name: 'checkout',
 *                 id: 'a1b2c3d4', message: 'order placed', args: [] });
 * // '2026-…  INFO  a1b2c3d4 --- [            checkout] order placed'
 *
 * @param {LogRecord} record - The record to render.
 * @returns {string} A single line, without a trailing newline.
 * @throws {TypeError} If `record` is not an object, if `record.ts` is not a
 *   valid instant, or if `level`, `name`, `id`, or `message` is not a string.
 */
export function formatLogLine(record) {
  if (record === null || typeof record !== 'object') {
    throw new TypeError('record must be an object');
  }
  const { ts, level, name, id, message } = record;
  assertString(level, 'record.level');
  assertString(name, 'record.name');
  assertString(id, 'record.id');
  assertString(message, 'record.message');

  const stamp = formatTimestamp(ts);
  const lvl = fixedWidth(oneLine(level).toUpperCase(), LEVEL_WIDTH);
  const tag = oneLine(id);
  const head = tag === '' ? `${stamp} ${lvl} ---` : `${stamp} ${lvl} ${tag} ---`;
  // Right-aligned and cut from the left, so the specific tail of every dotted
  // name lands on the same column no matter how long the prefix is.
  const context =
    name === ''
      ? ''
      : ` [${fixedWidth(oneLine(name), NAME_WIDTH, { align: 'right', truncate: 'start' })}]`;
  return `${head}${context} ${oneLine(message)}`;
}

/**
 * The default sink: one `console` call per record, chosen by level.
 *
 * `args` are spread *after* the line so a devtools console still renders them
 * as inspectable objects rather than flattened text.
 *
 * @param {LogRecord} record
 * @param {(record: LogRecord) => string} format
 * @returns {void}
 */
function consoleSink(record, format) {
  const line = format(record);
  const write = typeof console === 'undefined' ? undefined : console[CONSOLE_METHOD[record.level]];
  if (typeof write === 'function') {
    write.call(console, line, ...record.args);
  }
}

/**
 * Coerce a message to a string without ever throwing on the caller's behalf.
 *
 * @param {unknown} message
 * @returns {string}
 */
function toMessage(message) {
  return typeof message === 'string' ? message : String(message);
}

/**
 * @typedef {object} Logger
 * @property {(message?: unknown, ...args: unknown[]) => void} trace
 * @property {(message?: unknown, ...args: unknown[]) => void} debug
 * @property {(message?: unknown, ...args: unknown[]) => void} info
 * @property {(message?: unknown, ...args: unknown[]) => void} warn
 * @property {(message?: unknown, ...args: unknown[]) => void} error
 * @property {(context: string) => Logger} child - A logger sharing this one's
 *   configuration, named `'parent.context'`.
 */

/**
 * Build a logger over an already-validated configuration. Internal, so `child`
 * does not re-validate values that came from a validated parent.
 *
 * @param {string} level
 * @param {string} name
 * @param {(record: LogRecord, format: (record: LogRecord) => string) => void} sink
 * @param {(record: LogRecord) => string} format
 * @param {() => number} now
 * @param {string | (() => string)} id
 * @returns {Logger}
 */
function build(level, name, sink, format, now, id) {
  const threshold = RANK[level];

  /** @param {string} lvl @param {unknown} message @param {unknown[]} args @returns {void} */
  const emit = (lvl, message, args) => {
    if (RANK[lvl] < threshold) return;
    try {
      // Everything that can fail on someone else's behalf — the clock, the id
      // function, a hostile `toString`, the sink itself — is inside this try.
      // A dropped record is reported; it is never rethrown at the call site.
      /** @type {LogRecord} */
      const record = {
        ts: now(),
        level: lvl,
        name,
        id: typeof id === 'function' ? String(id()) : id,
        message: toMessage(message),
        args,
      };
      sink(record, format);
    } catch (failure) {
      lastResort(failure);
    }
  };

  return {
    trace: (message, ...args) => emit('trace', message, args),
    debug: (message, ...args) => emit('debug', message, args),
    info: (message, ...args) => emit('info', message, args),
    warn: (message, ...args) => emit('warn', message, args),
    error: (message, ...args) => emit('error', message, args),
    child: (context) => {
      assertString(context, 'context');
      if (context === '') {
        throw new TypeError('context must be a non-empty string');
      }
      return build(level, name === '' ? context : `${name}.${context}`, sink, format, now, id);
    },
  };
}

/**
 * @typedef {object} LoggerOptions
 * @property {'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent'} [level='info'] - The
 *   threshold: calls below it are skipped before anything is built.
 * @property {string} [name=''] - Context name for the `[name]` column; a child
 *   appends to it.
 * @property {(record: LogRecord, format: (record: LogRecord) => string) => void} [sink] -
 *   Where records go. Defaults to level-mapped `console` calls. Receives the
 *   formatter so a text sink can use it and a structured sink can ignore it.
 * @property {(record: LogRecord) => string} [format] - How a record renders.
 *   Defaults to {@link formatLogLine}.
 * @property {() => number} [now] - Clock returning epoch milliseconds; defaults
 *   to `Date.now`. Inject a fake one to make log assertions deterministic.
 * @property {string | (() => string)} [id=''] - Correlation id, or a function
 *   resolving one per record (for example `() => pageSessionId()` from
 *   `egl-utils-js/storage`, kept a parameter so `/logging` stays independent of
 *   `/storage`).
 */

/**
 * Create a logger (spec 02 F40).
 *
 * One threshold replaces the usual bag of per-level booleans: `level` is the
 * only switch, and `'silent'` turns everything off. Every seam that would
 * otherwise be hardcoded — clock, destination, line shape, correlation id — is
 * an option with a working default, which is what makes the logger testable
 * without capturing `console` and reusable outside a browser.
 *
 * Context is **explicit**: `child('db')` names the child rather than inferring
 * a name from `this` or a function reference. Inference reads well until a
 * minifier renames the function and every log line changes (ADR-0027).
 *
 * @example
 * const log = logger({ level: 'debug', name: 'checkout' });
 * log.info('order placed', { id: 42 }); // console.info(line, { id: 42 })
 * log.debug('cart contents', cart);
 * log.trace('not emitted — below the threshold');
 *
 * @example
 * // Structured sink: the formatter is handed over and simply not used.
 * const log = logger({ sink: (record) => queue.push(JSON.stringify(record)) });
 *
 * @example
 * // Deterministic tests: fixed clock, capturing sink.
 * const lines = [];
 * const log = logger({ now: () => 0, sink: (r, format) => lines.push(format(r)) });
 * log.error('boom');
 *
 * @param {LoggerOptions} [options]
 * @returns {Logger}
 * @throws {TypeError} If `level` is not one of {@link LOG_LEVELS}, if `name` is
 *   not a string, if `sink`, `format`, or `now` is not a function, or if `id` is
 *   neither a string nor a function.
 */
export function logger(options = {}) {
  const {
    level = 'info',
    name = '',
    sink = consoleSink,
    format = formatLogLine,
    now = Date.now,
    id = '',
    ...unknown
  } = options;
  assertNoUnknownOptions(unknown, 'logger');

  if (typeof level !== 'string' || !Object.hasOwn(RANK, level)) {
    throw new TypeError(`level must be one of: ${LOG_LEVELS.join(', ')}`);
  }
  assertString(name, 'name');
  assertFunction(sink, 'sink');
  assertFunction(format, 'format');
  assertFunction(now, 'now');
  if (typeof id !== 'string' && typeof id !== 'function') {
    throw new TypeError('id must be a string or a function');
  }

  return build(level, name, sink, format, now, id);
}
