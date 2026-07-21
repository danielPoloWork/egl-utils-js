/**
 * egl-utils-js — async combinators (spec §2 items 1–5, pure).
 *
 * Every combinator follows the signal-first cancellation contract
 * (ADR-0004): it accepts an `AbortSignal` in a trailing options bag, rejects
 * with the library's {@link AbortError} (`cause` = `signal.reason`) when
 * cancelled, starts no work on a pre-aborted signal, and removes every
 * listener and timer it installed once settled. Programmer errors (invalid
 * arguments) throw native `TypeError`; only operational failures use the
 * EglError taxonomy (ADR-0003).
 *
 * @module egl-utils-js/async
 */

import { AbortError, TimeoutError, RetryExhaustedError } from './errors.js';

/**
 * @param {number} ms
 * @param {string} name
 * @returns {void}
 */
function assertMilliseconds(ms, name) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    throw new TypeError(`${name} must be a finite non-negative number of milliseconds`);
  }
}

/**
 * @param {AbortSignal} signal
 * @returns {AbortError}
 */
function abortErrorFrom(signal) {
  return new AbortError(undefined, { cause: signal.reason });
}

/**
 * Full-jitter exponential backoff (spec §2 item 3): a uniform random wait in
 * `[0, min(maxDelay, minDelay * 2^(attempt-1)))`. Full jitter (not equal or
 * decorrelated) is the spec's explicit choice — it minimizes contention when
 * many callers retry in lockstep. Uses `Math.random`, which is correct here:
 * jitter needs no cryptographic randomness (unlike `uuid`, spec item 18).
 *
 * @param {number} attempt - 1-based number of the attempt that just failed.
 * @param {number} minDelay
 * @param {number} maxDelay
 * @returns {number} milliseconds to wait before the next attempt
 */
function jitteredBackoff(attempt, minDelay, maxDelay) {
  const ceiling = Math.min(maxDelay, minDelay * 2 ** (attempt - 1));
  return Math.random() * ceiling;
}

/**
 * Merge abort signals into one that aborts with the first reason.
 *
 * Internal stand-in for `AbortSignal.any`, which is unavailable on the
 * Node 18 runtime floor (ADR-0004); `cleanup` detaches the merge listeners
 * so settled combinators do not leak listeners on long-lived caller signals.
 *
 * @param {AbortSignal[]} signals
 * @returns {{ signal: AbortSignal, cleanup: () => void }}
 */
function anySignal(signals) {
  const controller = new AbortController();
  /** @type {Array<() => void>} */
  const detachers = [];

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    detachers.push(() => signal.removeEventListener('abort', onAbort));
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const detach of detachers) detach();
    },
  };
}

/**
 * Resolve after `ms` milliseconds (spec §2 item 1).
 *
 * @example
 * await delay(200, { signal: controller.signal });
 *
 * @param {number} ms - How long to wait, in milliseconds.
 * @param {{ signal?: AbortSignal }} [options] - `signal` cancels the wait:
 *   the promise rejects with {@link AbortError} (`cause` = `signal.reason`)
 *   and the timer is cleared.
 * @returns {Promise<void>}
 */
export function delay(ms, { signal } = {}) {
  assertMilliseconds(ms, 'ms');
  if (signal?.aborted) {
    return Promise.reject(abortErrorFrom(signal));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortErrorFrom(/** @type {AbortSignal} */ (signal)));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Enforce a time budget on an operation (spec §2 item 2).
 *
 * Built on `AbortSignal.timeout`. Pass the operation as a **task function**
 * `(signal) => promise` and it receives a signal that aborts on timeout or
 * caller cancellation — so the underlying work can actually stop, not just
 * be abandoned. A bare promise is also accepted, but since it is already in
 * flight it can only be abandoned at the deadline (its late failures are
 * absorbed to avoid unhandled rejections).
 *
 * Rejects with {@link TimeoutError} (`EGL_TIMEOUT`) at the deadline, or with
 * {@link AbortError} if the caller's `signal` aborts first.
 *
 * @example
 * const data = await timeout((signal) => client.get('/slow', { signal }), 5_000);
 *
 * @template T
 * @param {Promise<T> | ((signal: AbortSignal) => Promise<T> | T)} input -
 *   The operation: a task function receiving the merged signal (preferred),
 *   or an already-running promise.
 * @param {number} ms - The time budget, in milliseconds.
 * @param {{ signal?: AbortSignal }} [options] - `signal` cancels the whole
 *   operation before the deadline.
 * @returns {Promise<T>}
 */
export function timeout(input, ms, { signal } = {}) {
  assertMilliseconds(ms, 'ms');
  if (signal?.aborted) {
    return Promise.reject(abortErrorFrom(signal));
  }

  const timeoutSignal = AbortSignal.timeout(ms);
  const merged = signal
    ? anySignal([signal, timeoutSignal])
    : { signal: timeoutSignal, cleanup: () => {} };

  const operation =
    typeof input === 'function'
      ? Promise.resolve().then(() => input(merged.signal))
      : Promise.resolve(input);

  return new Promise((resolve, reject) => {
    let settled = false;

    /** @param {() => void} outcome */
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      timeoutSignal.removeEventListener('abort', onTimeout);
      signal?.removeEventListener('abort', onAbort);
      merged.cleanup();
      // Absorb the operation's late failure (typically its own abort) so an
      // already-decided timeout/abort never surfaces as an unhandled rejection.
      operation.catch(() => {});
      outcome();
    };

    const onTimeout = () =>
      settle(() =>
        reject(
          new TimeoutError(`Operation timed out after ${ms} ms`, { cause: timeoutSignal.reason }),
        ),
      );
    const onAbort = () => settle(() => reject(abortErrorFrom(/** @type {AbortSignal} */ (signal))));

    timeoutSignal.addEventListener('abort', onTimeout, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });

    operation.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

/**
 * @typedef {object} RetryAttempt
 * @property {number} attempt - 1-based number of the attempt that just failed.
 * @property {unknown} error - The failure that attempt raised.
 * @property {number} retriesLeft - Attempts still remaining after this one.
 * @property {number} [nextDelay] - Milliseconds until the next attempt;
 *   `undefined` when this was the final attempt (no retry follows).
 */

/**
 * Retry a failing operation with exponential backoff and full jitter
 * (spec §2 item 3). Signal-first per ADR-0004: `fn` receives the signal so
 * each attempt is itself cancellable, the backoff wait is abortable, and
 * cancellation is terminal — it rejects with {@link AbortError} immediately,
 * never wrapped in a {@link RetryExhaustedError}. When every attempt fails,
 * rejects with {@link RetryExhaustedError} carrying `attempts` and the
 * ordered `errors`.
 *
 * @example
 * const data = await retry((signal) => client.get('/flaky', { signal }), {
 *   retries: 4,
 *   minDelay: 200,
 *   onAttempt: ({ attempt, error }) => log.warn(`attempt ${attempt} failed`, error),
 * });
 *
 * @template T
 * @param {(signal?: AbortSignal) => Promise<T> | T} fn - The operation; it
 *   receives the caller's `signal` (or `undefined` when none was provided).
 * @param {object} [options]
 * @param {number} [options.retries] - Retries after the first attempt
 *   (default 3 → up to 4 attempts total).
 * @param {number} [options.minDelay] - Base backoff in ms (default 100).
 * @param {number} [options.maxDelay] - Backoff ceiling in ms (default 30000).
 * @param {AbortSignal} [options.signal] - Cancels the whole operation,
 *   including an in-progress backoff wait.
 * @param {(info: RetryAttempt) => void} [options.onAttempt] - Observation
 *   hook invoked after each failed attempt; exceptions from it propagate and
 *   abort the retry loop.
 * @returns {Promise<T>}
 */
export async function retry(fn, options = {}) {
  const { retries = 3, minDelay = 100, maxDelay = 30_000, signal, onAttempt } = options;

  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function');
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new TypeError('retries must be a non-negative integer');
  }
  assertMilliseconds(minDelay, 'minDelay');
  assertMilliseconds(maxDelay, 'maxDelay');
  if (maxDelay < minDelay) {
    throw new TypeError('maxDelay must be greater than or equal to minDelay');
  }
  if (onAttempt !== undefined && typeof onAttempt !== 'function') {
    throw new TypeError('onAttempt must be a function');
  }

  if (signal?.aborted) {
    throw abortErrorFrom(signal);
  }

  const maxAttempts = retries + 1;
  /** @type {unknown[]} */
  const errors = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(signal);
    } catch (error) {
      // Cancellation is terminal: a caller who aborted wants to stop, not
      // consume the remaining retries. The signal is the single source of
      // truth (ADR-0004), so abort-shaped errors from fn on a live signal
      // are treated as ordinary retryable failures.
      if (signal?.aborted) {
        throw abortErrorFrom(signal);
      }
      errors.push(error);
      const isLastAttempt = attempt === maxAttempts;
      const nextDelay = isLastAttempt ? undefined : jitteredBackoff(attempt, minDelay, maxDelay);
      onAttempt?.({ attempt, error, retriesLeft: maxAttempts - attempt, nextDelay });
      if (isLastAttempt) {
        break;
      }
      // Abortable backoff wait — throws AbortError if cancelled mid-wait.
      await delay(/** @type {number} */ (nextDelay), { signal });
    }
  }

  throw new RetryExhaustedError(`All ${maxAttempts} attempt(s) failed`, {
    attempts: maxAttempts,
    errors,
    cause: errors[errors.length - 1],
  });
}
