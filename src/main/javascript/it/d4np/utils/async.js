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

/**
 * Run tasks with bounded concurrency (spec §2 item 4). At most `limit` tasks
 * are in flight at once; results are returned in the tasks' input order.
 *
 * Each task is a function `(signal) => promise` that receives a signal
 * merging the caller's `signal` with an internal fail-fast controller
 * (ADR-0004), so a task can stop when a sibling fails or the caller cancels.
 *
 * Partial-failure policy is explicit:
 * - **fail-fast (default)** — the first task rejection aborts the shared
 *   signal (pending tasks never launch; in-flight ones that respect the
 *   signal stop) and rejects with that first error, without waiting for
 *   stragglers that ignore the signal (their late settlements are absorbed).
 * - **`{ settle: true }`** — no task failure aborts the others; every task
 *   runs to completion and the result is a `PromiseSettledResult[]`.
 *
 * A caller `signal` abort is terminal in **both** modes: it rejects with
 * {@link AbortError}, distinct from a task failure.
 *
 * @template T
 * @overload
 * @param {Array<(signal: AbortSignal) => Promise<T> | T>} tasks
 * @param {number} limit
 * @param {{ signal?: AbortSignal, settle?: false }} [options]
 * @returns {Promise<T[]>}
 */
/**
 * @template T
 * @overload
 * @param {Array<(signal: AbortSignal) => Promise<T> | T>} tasks
 * @param {number} limit
 * @param {{ signal?: AbortSignal, settle: true }} options
 * @returns {Promise<PromiseSettledResult<T>[]>}
 */
/**
 * @template T
 * @param {Array<(signal: AbortSignal) => Promise<T> | T>} tasks - The task
 *   functions; each receives the merged signal.
 * @param {number} limit - Maximum tasks in flight at once (positive integer).
 * @param {{ signal?: AbortSignal, settle?: boolean }} [options]
 * @returns {Promise<T[] | PromiseSettledResult<T>[]>}
 */
export function parallelLimit(tasks, limit, options = {}) {
  const { signal, settle = false } = options;

  if (!Array.isArray(tasks) || tasks.some((task) => typeof task !== 'function')) {
    throw new TypeError('tasks must be an array of task functions');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError('limit must be a positive integer');
  }

  if (signal?.aborted) {
    return Promise.reject(abortErrorFrom(signal));
  }
  if (tasks.length === 0) {
    return Promise.resolve([]);
  }

  const failFast = new AbortController();
  const merged = anySignal(signal ? [signal, failFast.signal] : [failFast.signal]);

  return new Promise((resolve, reject) => {
    /** @type {any[]} */
    const results = new Array(tasks.length);
    let nextIndex = 0;
    let running = 0;
    let remaining = tasks.length;
    let settled = false;

    // Settle-once is enforced by the handler-level `if (settled) return` guards
    // plus removing the caller-abort listener here, so finalize is reached at
    // most once (JS run-to-completion leaves no gap between a guard and its
    // finalize call) — no redundant guard needed inside it.
    /** @param {() => void} action */
    const finalize = (action) => {
      settled = true;
      signal?.removeEventListener('abort', onCallerAbort);
      // Stop any in-flight task that respects the signal; harmless if already aborted.
      failFast.abort();
      merged.cleanup();
      action();
    };

    function onCallerAbort() {
      finalize(() => reject(abortErrorFrom(/** @type {AbortSignal} */ (signal))));
    }

    const pump = () => {
      // Every caller reaches pump only while `settled` is false (the initial
      // call, or a handler that already returned early when settled).
      while (running < limit && nextIndex < tasks.length) {
        const index = nextIndex;
        nextIndex += 1;
        running += 1;
        Promise.resolve()
          .then(() => tasks[index](merged.signal))
          .then(
            (value) => {
              running -= 1;
              if (settled) return;
              results[index] = settle ? { status: 'fulfilled', value } : value;
              remaining -= 1;
              if (remaining === 0) finalize(() => resolve(results));
              else pump();
            },
            (reason) => {
              running -= 1;
              if (settled) return;
              if (settle) {
                results[index] = { status: 'rejected', reason };
                remaining -= 1;
                if (remaining === 0) finalize(() => resolve(results));
                else pump();
              } else {
                // fail-fast: reject with the first error now, abandoning any
                // straggler that ignores the abort (its settlement is absorbed
                // by the `if (settled) return` guards above).
                finalize(() => reject(reason));
              }
            },
          );
      }
    };

    signal?.addEventListener('abort', onCallerAbort, { once: true });
    pump();
  });
}

/**
 * @typedef {object} AsyncQueue
 * @property {<R>(task: (signal?: AbortSignal) => Promise<R> | R) => Promise<R>} push
 *   Enqueue a task; returns a promise for its outcome. Tasks run one at a
 *   time in FIFO order and receive the queue's `signal`. After the queue is
 *   aborted, `push` rejects immediately with {@link AbortError}.
 * @property {() => Promise<void>} onIdle - Resolves the next time the queue is
 *   empty (nothing running or waiting); resolves immediately if already idle.
 * @property {number} size - Tasks not yet settled: waiting plus the running one.
 */

/**
 * Create a FIFO serial task queue (spec §2 item 5). Tasks run one at a time
 * in the order pushed; `push` returns a promise for the task's outcome.
 *
 * Signal-first per ADR-0004: each task receives the queue's `signal`, and
 * aborting it **drains the pending tasks** — every queued-but-not-started
 * task's promise rejects with {@link AbortError}, and any later `push`
 * rejects immediately. The already-running task received the signal and is
 * left to stop itself.
 *
 * @example
 * const queue = asyncQueue({ signal });
 * const first = queue.push((signal) => writeThing(a, { signal }));
 * const second = queue.push((signal) => writeThing(b, { signal })); // runs after `first`
 * await queue.onIdle();
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {AsyncQueue}
 */
export function asyncQueue(options = {}) {
  const { signal } = options;

  /**
   * @typedef {object} QueueItem
   * @property {(signal?: AbortSignal) => unknown} task
   * @property {(value: any) => void} resolve
   * @property {(reason: unknown) => void} reject
   */
  /** @type {QueueItem[]} */
  const queue = [];
  let running = false;
  let aborted = signal?.aborted ?? false;
  /** @type {Array<() => void>} */
  let idleWaiters = [];

  const settleIdleIfIdle = () => {
    if (running || queue.length > 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolveWaiter of waiters) resolveWaiter();
  };

  const runNext = () => {
    if (running || queue.length === 0) return;
    running = true;
    const item = /** @type {QueueItem} */ (queue.shift());
    Promise.resolve()
      .then(() => item.task(signal))
      .then(item.resolve, item.reject)
      .finally(() => {
        running = false;
        runNext();
        settleIdleIfIdle();
      });
  };

  signal?.addEventListener(
    'abort',
    () => {
      aborted = true;
      const pending = queue.splice(0, queue.length);
      for (const item of pending) {
        item.reject(abortErrorFrom(/** @type {AbortSignal} */ (signal)));
      }
      settleIdleIfIdle();
    },
    { once: true },
  );

  return {
    push(task) {
      if (typeof task !== 'function') {
        throw new TypeError('task must be a function');
      }
      if (aborted) {
        return Promise.reject(abortErrorFrom(/** @type {AbortSignal} */ (signal)));
      }
      return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject });
        runNext();
      });
    },
    onIdle() {
      if (!running && queue.length === 0) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        idleWaiters.push(resolve);
      });
    },
    get size() {
      return queue.length + (running ? 1 : 0);
    },
  };
}
