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

/**
 * Raised by the `egl-utils-js/dom` entry when its environmental contract is not
 * met: no DOM is present, or a required element is missing (spec 03 §2 item
 * F43). Code: `EGL_DOM_CONTRACT`.
 *
 * `/dom` fails fast rather than degrading. The storage wrappers' silent
 * in-memory fallback (ADR-0010) is right because degraded storage still has
 * meaning; a no-op `setVisible` has none — it would report success while the
 * page stayed unchanged. A typed error with a stable code also keeps a
 * server-side render diagnosable, where a bare `ReferenceError: document is not
 * defined` names the symptom rather than the contract (ADR-0028).
 */
export class DomContractError extends EglError {
  name = 'DomContractError';
  code = 'EGL_DOM_CONTRACT';

  /**
   * @param {string} message
   * @param {ErrorOptions & { missing?: readonly string[] }} [options]
   *   `missing` lists the names whose selector matched nothing, for the
   *   `bindElements` strict-mode failure.
   */
  constructor(message, options) {
    super(message, options);

    /**
     * Names whose selector matched no element, when this error came from
     * `bindElements({ strict: true })`; otherwise an empty array.
     *
     * @type {readonly string[]}
     */
    this.missing = options?.missing ?? [];
  }
}

/**
 * Raised when a clipboard write could not be performed (spec 06 §2 item F97).
 * Code: `EGL_CLIPBOARD`.
 *
 * The clipboard is permission-gated and secure-context-only, and both refusals
 * are ordinary rather than exceptional: a page served over plain HTTP has no
 * `navigator.clipboard` at all, and a user or a policy can deny the permission on
 * a page that does. F97 exists because those two outcomes must not look like
 * success — "nothing happened" and "it worked" are indistinguishable to a user
 * staring at a button, and a swallowed rejection is how a copy feature ships
 * broken.
 *
 * `reason` says which wall was hit, so a caller can tell a fixable problem
 * (`'insecure'` — serve over HTTPS) from one that is the user's to allow
 * (`'denied'`) from one that is neither (`'failed'`).
 *
 * @example
 * try {
 *   await copyToClipboard(tableCsv(rows, { columns }));
 *   toast('Copied');
 * } catch (error) {
 *   if (error.code === 'EGL_CLIPBOARD') toast(hint(error.reason));
 *   else throw error;
 * }
 */
export class ClipboardError extends EglError {
  name = 'ClipboardError';
  code = 'EGL_CLIPBOARD';

  /**
   * @param {string} message
   * @param {ErrorOptions & { reason?: 'unsupported' | 'insecure' | 'denied' | 'failed' }} [options]
   *   `reason` classifies the refusal; `cause` carries the platform's own error
   *   where there was one.
   */
  constructor(message, options) {
    super(message, options);

    /**
     * Why the write did not happen: `'unsupported'` (no clipboard API at all),
     * `'insecure'` (present but the context is not secure), `'denied'` (the
     * permission was refused), or `'failed'` (the platform rejected for its own
     * reason, in `cause`).
     *
     * @type {'unsupported' | 'insecure' | 'denied' | 'failed'}
     */
    this.reason = options?.reason ?? 'failed';
  }
}

/**
 * Raised when an **optional peer dependency** a wrapper needs is not reachable
 * (spec 04 §2 item F68). Code: `EGL_PEER_MISSING`.
 *
 * The `egl-utils-js/bootstrap` element builders need nothing but a document, so
 * the entry imports the `bootstrap` package nowhere and stays free of it; the
 * behaviour wrappers do need it, and resolve it at **first use** — never at
 * module load, which would make one `import` of the entry fail for everyone who
 * only wanted a badge. What is left is a failure at the call, and this is its
 * shape: a stable code a caller can branch on, and a message naming the package
 * and both remedies (install the peer, or load the bundle that defines the
 * global). `ReferenceError: bootstrap is not defined` names neither.
 *
 * @example
 * try {
 *   modal.show();
 * } catch (error) {
 *   if (error.code === 'EGL_PEER_MISSING') showSetupHint(error.peer);
 * }
 */
export class PeerMissingError extends EglError {
  name = 'PeerMissingError';
  code = 'EGL_PEER_MISSING';

  /**
   * @param {string} message
   * @param {ErrorOptions & { peer?: string }} [options]
   *   `peer` is the npm package name that could not be resolved.
   */
  constructor(message, options) {
    super(message, options);

    /**
     * The npm package name that could not be resolved — `'bootstrap'`, or
     * `'@popperjs/core'` where a component needs Popper too.
     *
     * @type {string}
     */
    this.peer = options?.peer ?? '';
  }
}
