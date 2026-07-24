/**
 * egl-utils-js — diagnostics utilities (spec §2 items 20, 25; pure by
 * contract: timing a function never changes what it returns or throws).
 *
 * @module egl-utils-js/diagnostics
 */

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
