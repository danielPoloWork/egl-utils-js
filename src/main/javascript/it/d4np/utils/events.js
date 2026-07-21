/**
 * egl-utils-js — typed event helpers (spec §2 items 6–8, **stateful**).
 *
 * Unlike the data/async modules, an emitter holds mutable listener state by
 * contract (spec §3). The typed surface is the module's point: the
 * `EventMap` generic gives every `on`/`once`/`off`/`emit` call site an exact
 * payload type under JSDoc + checkJs (ADR-0006).
 *
 * @module egl-utils-js/events
 */

/**
 * @typedef {object} ListenerEntry
 * @property {(payload: any) => void} listener - The subscriber (internally
 *   untyped; the public generics type every call site).
 * @property {boolean} once - Whether the entry auto-removes after one call.
 */

/**
 * A minimal typed event emitter (spec §2 item 6, ADR-0006).
 *
 * `EventMap` maps each event name to its **single payload type**:
 *
 * ```js
 * /** @type {EventEmitter<{ data: string, done: undefined, error: unknown }>} *\/
 * const emitter = new EventEmitter();
 * emitter.on('data', (chunk) => chunk.length); // chunk: string
 * emitter.emit('data', 'hello');
 * ```
 *
 * **Exception isolation** (spec item 6): a throwing listener never prevents
 * the remaining listeners from running. Collected exceptions are reported to
 * the `'error'` listeners — declare `error: unknown` in your `EventMap` to
 * subscribe with full typing. Exceptions thrown by `'error'` listeners
 * themselves are swallowed (no recursive reporting). If a listener throws
 * and **no** `'error'` listener is subscribed, `emit` throws after all
 * listeners have run (the single error, or an `AggregateError`) — a failure
 * is never silently lost.
 *
 * Dispatch uses a snapshot: listeners added or removed *during* an emit do
 * not affect that emit's dispatch. Duplicate registrations are allowed and
 * called once per registration; `off` removes one matching registration.
 *
 * @template {Record<string, unknown>} [EventMap=Record<string, unknown>]
 */
export class EventEmitter {
  /** @type {Map<string, ListenerEntry[]>} */
  #listeners = new Map();

  /**
   * Subscribe to an event.
   *
   * @template {Extract<keyof EventMap, string>} K
   * @param {K} event - The event name.
   * @param {(payload: EventMap[K]) => void} listener
   * @returns {() => void} An idempotent unsubscribe function for exactly
   *   this registration.
   * @throws {TypeError} If `event` is not a string or `listener` is not a
   *   function.
   */
  on(event, listener) {
    return this.#add(event, listener, false);
  }

  /**
   * Subscribe for a single delivery; the registration is removed before the
   * listener runs (so a re-emit from inside it cannot re-fire).
   *
   * @template {Extract<keyof EventMap, string>} K
   * @param {K} event - The event name.
   * @param {(payload: EventMap[K]) => void} listener
   * @returns {() => void} An idempotent unsubscribe function.
   * @throws {TypeError} If `event` is not a string or `listener` is not a
   *   function.
   */
  once(event, listener) {
    return this.#add(event, listener, true);
  }

  /**
   * Remove one registration of `listener` for `event` (the earliest match);
   * a listener registered twice needs two `off` calls. Unknown listeners are
   * a no-op.
   *
   * @template {Extract<keyof EventMap, string>} K
   * @param {K} event - The event name.
   * @param {(payload: EventMap[K]) => void} listener
   * @returns {void}
   */
  off(event, listener) {
    const entries = this.#listeners.get(event);
    if (!entries) return;
    const index = entries.findIndex((entry) => entry.listener === listener);
    if (index !== -1) {
      entries.splice(index, 1);
      if (entries.length === 0) this.#listeners.delete(event);
    }
  }

  /**
   * Emit an event to all current listeners (snapshot semantics).
   *
   * @template {Extract<keyof EventMap, string>} K
   * @param {K} event - The event name.
   * @param {EventMap[K]} payload - The payload each listener receives.
   * @returns {boolean} Whether at least one listener was subscribed.
   * @throws {unknown} A listener's exception (or an `AggregateError` of
   *   several) when no `'error'` listener is subscribed — after every
   *   listener has run.
   */
  emit(event, payload) {
    if (typeof event !== 'string') {
      throw new TypeError('event must be a string');
    }
    const entries = this.#listeners.get(event);
    if (!entries || entries.length === 0) return false;

    /** @type {unknown[]} */
    const failures = [];
    for (const entry of entries.slice()) {
      if (entry.once) this.#removeEntry(event, entry);
      try {
        entry.listener(payload);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) this.#reportFailures(failures);
    return true;
  }

  /**
   * @param {string} event
   * @param {(payload: any) => void} listener
   * @param {boolean} once
   * @returns {() => void}
   */
  #add(event, listener, once) {
    if (typeof event !== 'string') {
      throw new TypeError('event must be a string');
    }
    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function');
    }
    /** @type {ListenerEntry} */
    const entry = { listener, once };
    let entries = this.#listeners.get(event);
    if (!entries) {
      entries = [];
      this.#listeners.set(event, entries);
    }
    entries.push(entry);
    return () => this.#removeEntry(event, entry);
  }

  /**
   * @param {string} event
   * @param {ListenerEntry} entry
   * @returns {void}
   */
  #removeEntry(event, entry) {
    const entries = this.#listeners.get(event);
    if (!entries) return;
    const index = entries.indexOf(entry);
    if (index !== -1) {
      entries.splice(index, 1);
      if (entries.length === 0) this.#listeners.delete(event);
    }
  }

  /**
   * Report listener exceptions per the isolation contract: to the `'error'`
   * listeners present at report time (their own exceptions swallowed), or —
   * for failures nobody is listening for — by throwing at the end of `emit`.
   *
   * @param {unknown[]} failures
   * @returns {void}
   */
  #reportFailures(failures) {
    /** @type {unknown[]} */
    const unreported = [];
    for (const failure of failures) {
      const entries = this.#listeners.get('error');
      if (!entries || entries.length === 0) {
        unreported.push(failure);
        continue;
      }
      for (const entry of entries.slice()) {
        if (entry.once) this.#removeEntry('error', entry);
        try {
          entry.listener(failure);
        } catch {
          // Swallowed by contract: 'error' listeners must not recurse.
        }
      }
    }
    if (unreported.length === 1) throw unreported[0];
    if (unreported.length > 1) {
      throw new AggregateError(
        unreported,
        'Multiple listeners failed with no error listener subscribed',
      );
    }
  }
}

/**
 * @template {(...args: any[]) => any} F
 * @typedef {((...args: Parameters<F>) => ReturnType<F> | undefined) & {
 *   cancel: () => void,
 *   flush: () => ReturnType<F> | undefined,
 * }} Debounced
 */

/**
 * Create a debounced wrapper of `fn` (spec §2 item 7). By default `fn` runs
 * on the **trailing edge** — once, `delay` ms after the last call of a burst,
 * with the most recent `this`/arguments. The wrapper returns the result of
 * the last actual `fn` invocation.
 *
 * The `leading`/`maxWait` interplay follows the well-tested lodash semantics:
 * - `leading: true` also runs `fn` on the **leading edge** (immediately on the
 *   first call of a burst). A burst of a single call fires **once** (leading
 *   only) — the trailing invoke is suppressed when no further call arrived
 *   during the wait, so `leading` never double-invokes a lone call.
 * - `maxWait` caps how long `fn` can be starved during a *sustained* burst
 *   (calls arriving faster than `delay`): `fn` is guaranteed to run at least
 *   every `maxWait` ms. Effective `maxWait` is `max(maxWait, delay)`.
 *
 * `.cancel()` drops any pending trailing invocation and resets state.
 * `.flush()` runs any pending trailing invocation immediately and returns its
 * result (or the last result if nothing is pending).
 *
 * @example
 * const onResize = debounce(() => layout(), 150);
 * window.addEventListener('resize', onResize);
 * // later: onResize.cancel();
 *
 * @template {(...args: any[]) => any} F
 * @param {F} fn - The function to debounce.
 * @param {number} delay - The quiet period in milliseconds.
 * @param {{ leading?: boolean, maxWait?: number }} [options]
 * @returns {Debounced<F>} The debounced function with `cancel`/`flush`.
 * @throws {TypeError} If `fn` is not a function, or `delay`/`maxWait` is not a
 *   finite non-negative number.
 */
export function debounce(fn, delay, options = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function');
  }
  if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0) {
    throw new TypeError('delay must be a finite non-negative number of milliseconds');
  }
  const leading = options.leading ?? false;
  const maxing = options.maxWait !== undefined;
  let maxWait = 0;
  if (maxing) {
    const requested = options.maxWait;
    if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 0) {
      throw new TypeError('maxWait must be a finite non-negative number of milliseconds');
    }
    maxWait = Math.max(requested, delay);
  }

  /** @type {any[] | undefined} */
  let lastArgs;
  /** @type {unknown} */
  let lastThis;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timerId;
  /** @type {number | undefined} */
  let lastCallTime;
  let lastInvokeTime = 0;
  /** @type {ReturnType<F> | undefined} */
  let result;

  /** @param {number} time @returns {ReturnType<F>} */
  function invokeFunc(time) {
    const args = /** @type {Parameters<F>} */ (lastArgs);
    const thisArg = lastThis;
    lastArgs = undefined;
    lastThis = undefined;
    lastInvokeTime = time;
    result = fn.apply(thisArg, args);
    return /** @type {ReturnType<F>} */ (result);
  }

  /** @param {number} time @returns {boolean} */
  function shouldInvoke(time) {
    if (lastCallTime === undefined) return true;
    const sinceCall = time - lastCallTime;
    const sinceInvoke = time - lastInvokeTime;
    // Elapsed the quiet period, a backwards clock jump, or hit the max wait.
    return sinceCall >= delay || sinceCall < 0 || (maxing && sinceInvoke >= maxWait);
  }

  /** @param {number} time @returns {number} */
  function remainingWait(time) {
    const sinceCall = time - /** @type {number} */ (lastCallTime);
    const sinceInvoke = time - lastInvokeTime;
    const waiting = delay - sinceCall;
    return maxing ? Math.min(waiting, maxWait - sinceInvoke) : waiting;
  }

  /** @param {number} time @returns {ReturnType<F> | undefined} */
  function trailingEdge(time) {
    timerId = undefined;
    // Only invoke if a call arrived during the wait (lastArgs still set).
    if (lastArgs) return invokeFunc(time);
    lastArgs = undefined;
    lastThis = undefined;
    return result;
  }

  function timerExpired() {
    const time = Date.now();
    if (shouldInvoke(time)) {
      trailingEdge(time);
      return;
    }
    timerId = setTimeout(timerExpired, remainingWait(time));
  }

  /** @param {number} time @returns {ReturnType<F> | undefined} */
  function leadingEdge(time) {
    lastInvokeTime = time;
    timerId = setTimeout(timerExpired, delay);
    return leading ? invokeFunc(time) : result;
  }

  /**
   * @this {unknown}
   * @param {...any} args
   * @returns {ReturnType<F> | undefined}
   */
  function debounced(...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);
    lastArgs = args;
    lastThis = this;
    lastCallTime = time;
    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxing) {
        // Sustained burst hit maxWait: restart the timer and invoke now.
        timerId = setTimeout(timerExpired, delay);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, delay);
    }
    return result;
  }

  function cancel() {
    if (timerId !== undefined) clearTimeout(timerId);
    lastInvokeTime = 0;
    lastArgs = undefined;
    lastCallTime = undefined;
    lastThis = undefined;
    timerId = undefined;
  }

  /** @returns {ReturnType<F> | undefined} */
  function flush() {
    return timerId === undefined ? result : trailingEdge(Date.now());
  }

  return /** @type {Debounced<F>} */ (Object.assign(debounced, { cancel, flush }));
}
