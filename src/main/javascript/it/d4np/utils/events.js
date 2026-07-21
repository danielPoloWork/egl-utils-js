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
