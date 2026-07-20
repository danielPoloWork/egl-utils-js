/**
 * egl-utils-js/errors — shared typed error classes.
 *
 * Every failure this library raises extends {@link EglError} and carries a
 * stable, machine-readable `code`. Consumers should branch on `code` (or
 * `name`), never on cross-realm `instanceof`: the dual ESM/CJS build
 * (ADR-001) means two module instances of these classes can legitimately
 * coexist in one process, and `instanceof` fails across them by design.
 * The `EGL_*` codes are public API — changing one is a breaking change
 * (ADR-0003).
 *
 * @module egl-utils-js/errors
 */

/**
 * Base class for every error this library raises.
 *
 * Identity contract: check `code` (cross-realm-safe), not `instanceof`
 * across package boundaries.
 *
 * @example
 * try {
 *   await timeout(fetchThing(), 5_000);
 * } catch (err) {
 *   if (err instanceof Error && 'code' in err && err.code === 'EGL_TIMEOUT') {
 *     // handle the timeout
 *   }
 * }
 */
export class EglError extends Error {
  /** @type {string} */
  name = 'EglError';

  /**
   * Stable machine-readable error code — the cross-realm-safe identity.
   * @type {string}
   */
  code = 'EGL_ERROR';

  /**
   * @param {string} message - Human-readable description of the failure.
   * @param {ErrorOptions} [options] - Standard error options (`cause`).
   */
  constructor(message, options) {
    super(message, options);
  }
}

/**
 * Raised when an operation did not settle within its time budget
 * (spec §2 item 2). Code: `EGL_TIMEOUT`.
 */
export class TimeoutError extends EglError {
  name = 'TimeoutError';
  code = 'EGL_TIMEOUT';

  /**
   * @param {string} [message]
   * @param {ErrorOptions} [options]
   */
  constructor(message = 'Operation timed out', options) {
    super(message, options);
  }
}

/**
 * Raised when an operation is cancelled through an `AbortSignal`.
 * Code: `EGL_ABORT`.
 *
 * The `name` follows the DOM convention (`'AbortError'`), so the
 * ecosystem-standard check `err.name === 'AbortError'` recognizes this class
 * and the platform's own `DOMException` aborts alike (spec §3's
 * "re-exported DOM convention").
 */
export class AbortError extends EglError {
  name = 'AbortError';
  code = 'EGL_ABORT';

  /**
   * @param {string} [message]
   * @param {ErrorOptions} [options]
   */
  constructor(message = 'The operation was aborted', options) {
    super(message, options);
  }
}

/**
 * Raised by `retry` when every attempt failed (spec §2 item 3).
 * Code: `EGL_RETRY_EXHAUSTED`.
 */
export class RetryExhaustedError extends EglError {
  name = 'RetryExhaustedError';
  code = 'EGL_RETRY_EXHAUSTED';

  /**
   * @param {string} message
   * @param {{ attempts: number, errors: unknown[], cause?: unknown }} details
   *   `attempts` is how many attempts ran; `errors` holds each attempt's
   *   failure in order (the last is typically the most relevant `cause`).
   */
  constructor(message, details) {
    super(message, details);

    /** Number of attempts performed before giving up. @type {number} */
    this.attempts = details.attempts;

    /** The failure raised by each attempt, in order. @type {unknown[]} */
    this.errors = details.errors;
  }
}

/**
 * Raised by `httpClient` on a non-2xx response (spec §2 item 16).
 * Code: `EGL_HTTP`.
 */
export class HttpError extends EglError {
  name = 'HttpError';
  code = 'EGL_HTTP';

  /**
   * @param {string} message
   * @param {{ status: number, body?: unknown, cause?: unknown }} details
   *   `status` is the HTTP response status; `body` the parsed response body,
   *   when one could be read.
   */
  constructor(message, details) {
    super(message, details);

    /** HTTP response status code. @type {number} */
    this.status = details.status;

    /** Parsed response body, when available. @type {unknown} */
    this.body = details.body;
  }
}

/**
 * Raised by `deepClone` when a value cannot be structured-cloned, naming the
 * offending path instead of the platform's opaque `DataCloneError`
 * (ADR-002, spec §2 item 9). Code: `EGL_CLONE`.
 */
export class CloneError extends EglError {
  name = 'CloneError';
  code = 'EGL_CLONE';

  /**
   * @param {string} message
   * @param {{ path: string, valueType: string, cause?: unknown }} details
   *   `path` locates the unsupported value (e.g. `"config.handlers[2]"`);
   *   `valueType` names its type (e.g. `"function"`).
   */
  constructor(message, details) {
    super(message, details);

    /** Property path of the value that cannot be cloned. @type {string} */
    this.path = details.path;

    /** The unsupported value's type. @type {string} */
    this.valueType = details.valueType;
  }
}

/**
 * Raised by the storage wrappers on quota or serialization failures
 * (spec §2 items 21–22). Code: `EGL_STORAGE`.
 */
export class StorageError extends EglError {
  name = 'StorageError';
  code = 'EGL_STORAGE';

  /**
   * @param {string} message
   * @param {ErrorOptions} [options]
   */
  constructor(message, options) {
    super(message, options);
  }
}

/**
 * Raised by `parseDuration` on input that is not a valid duration string —
 * invalid input always throws, never returns `NaN` (spec §2 item 25).
 * Code: `EGL_DURATION_PARSE`.
 */
export class DurationParseError extends EglError {
  name = 'DurationParseError';
  code = 'EGL_DURATION_PARSE';

  /**
   * @param {string} message
   * @param {ErrorOptions} [options]
   */
  constructor(message, options) {
    super(message, options);
  }
}
