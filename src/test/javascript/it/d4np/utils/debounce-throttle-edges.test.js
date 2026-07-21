import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle } from '../../../../../main/javascript/it/d4np/utils/events.js';

// Roadmap 4.4 — residual edge cases for the rate limiters, complementing the
// mainline suites (debounce.test.js, throttle.test.js): zero durations,
// control-method idempotence, reuse after cancel/flush, re-entrancy, throwing
// wrapped functions, exact boundary configs, and instance isolation.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('debounce — zero delay', () => {
  it('trailing fires on the next timer tick with delay 0', () => {
    const fn = vi.fn();
    const d = debounce(fn, 0);
    d('a');
    expect(fn).not.toHaveBeenCalled(); // still asynchronous, never same-tick
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');
  });

  it('leading + delay 0: lone call fires once, burst fires leading and trailing', () => {
    const fn = vi.fn();
    const d = debounce(fn, 0, { leading: true });
    d('lone');
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1); // no trailing double-invoke

    const fn2 = vi.fn();
    const d2 = debounce(fn2, 0, { leading: true });
    d2('first');
    d2('second'); // same tick — within the (zero-length) window
    vi.advanceTimersByTime(0);
    expect(fn2).toHaveBeenCalledTimes(2);
    expect(fn2.mock.calls.map((c) => c[0])).toEqual(['first', 'second']);
  });
});

describe('debounce — control-method idempotence and reuse', () => {
  it('cancel with nothing pending is a safe no-op', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    expect(() => d.cancel()).not.toThrow(); // never called at all
    d('a');
    vi.advanceTimersByTime(100); // trailing consumed
    expect(() => d.cancel()).not.toThrow(); // nothing pending anymore
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush twice in a row invokes once and repeats the result', () => {
    const fn = vi.fn((x) => `r:${x}`);
    const d = debounce(fn, 100);
    d('a');
    expect(d.flush()).toBe('r:a');
    expect(d.flush()).toBe('r:a'); // second flush: nothing pending, same result
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stays fully usable after flush — the next call opens a fresh window', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d.flush();
    d('b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('b');
  });

  it('two wrappers of the same fn are fully independent', () => {
    const fn = vi.fn();
    const first = debounce(fn, 100);
    const second = debounce(fn, 100);
    first('one');
    second('two');
    first.cancel(); // must not affect `second`
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('two');
  });
});

describe('debounce — re-entrancy', () => {
  it('a wrapped fn calling its own wrapper schedules a new trailing, no recursion', () => {
    /** @type {string[]} */
    const invoked = [];
    let reentered = false;
    /** @type {import('../../../../../main/javascript/it/d4np/utils/events.js').Debounced<(tag: string) => void>} */
    const d = debounce(
      (tag) => {
        invoked.push(tag);
        if (!reentered) {
          reentered = true;
          d('inner'); // re-enter during the leading invoke
        }
      },
      100,
      { leading: true },
    );

    d('outer');
    expect(invoked).toEqual(['outer']); // no synchronous re-invoke
    vi.advanceTimersByTime(100);
    expect(invoked).toEqual(['outer', 'inner']); // re-entrant call landed as trailing
    vi.advanceTimersByTime(300);
    expect(invoked).toEqual(['outer', 'inner']); // and nothing loops forever
  });
});

describe('debounce — throwing wrapped functions', () => {
  it('a leading invoke that throws propagates to the caller and leaves the wrapper usable', () => {
    const boom = new Error('leading blew up');
    let shouldThrow = true;
    const calls = vi.fn();
    const d = debounce(
      (x) => {
        calls(x);
        if (shouldThrow) throw boom;
      },
      100,
      { leading: true },
    );

    expect(() => d('a')).toThrow(boom); // synchronous leading throw reaches the caller
    shouldThrow = false;
    vi.advanceTimersByTime(150); // let the burst window close
    d('b'); // fresh burst — leading again
    expect(calls).toHaveBeenLastCalledWith('b');
    vi.advanceTimersByTime(200);
    expect(calls).toHaveBeenCalledTimes(2); // 'a' (threw) + 'b'; no ghost invocations
  });

  it('a flush whose invocation throws propagates and leaves state consistent', () => {
    const boom = new Error('flush blew up');
    let shouldThrow = true;
    const calls = vi.fn();
    const d = debounce((x) => {
      calls(x);
      if (shouldThrow) throw boom;
    }, 100);

    d('a');
    expect(() => d.flush()).toThrow(boom);
    shouldThrow = false;
    vi.advanceTimersByTime(300);
    expect(calls).toHaveBeenCalledTimes(1); // the thrown invocation was consumed, not retried
    d('b'); // wrapper still works
    vi.advanceTimersByTime(100);
    expect(calls).toHaveBeenLastCalledWith('b');
  });
});

describe('debounce — boundary configurations', () => {
  it('maxWait exactly equal to delay behaves like plain trailing for a lone burst', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { maxWait: 100 });
    d('a');
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('explicit undefined options fall back to the defaults', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { leading: undefined, maxWait: undefined });
    d('a');
    expect(fn).not.toHaveBeenCalled(); // leading defaulted to false
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1); // no maxWait machinery engaged
  });
});

describe('throttle — zero interval and rate-memory', () => {
  it('interval 0 invokes for every spaced call', () => {
    const fn = vi.fn();
    const t = throttle(fn, 0);
    t('a');
    vi.advanceTimersByTime(0);
    t('b');
    vi.advanceTimersByTime(0);
    t('c');
    vi.advanceTimersByTime(0);
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  });

  it('cancel erases the rate-limit memory — the next call is a fresh leading edge', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('a'); // leading
    expect(fn).toHaveBeenCalledTimes(1);
    t('b'); // within the interval — pending trailing
    t.cancel(); // drops trailing AND forgets lastInvokeTime
    t('c'); // immediately after: fires leading again despite < interval elapsed
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c');
    t.cancel(); // drop the trailing scheduled by 'c'
  });

  it('bursts separated by more than the interval each get an immediate leading edge', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('burst1');
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250); // quiet period longer than the interval
    t('burst2');
    expect(fn).toHaveBeenCalledTimes(2); // immediate again, no waiting
    expect(fn).toHaveBeenLastCalledWith('burst2');
  });

  it('a throwing leading invoke propagates and the throttle keeps working', () => {
    const boom = new Error('throttled fn blew up');
    let shouldThrow = true;
    const calls = vi.fn();
    const t = throttle((x) => {
      calls(x);
      if (shouldThrow) throw boom;
    }, 100);

    expect(() => t('a')).toThrow(boom);
    shouldThrow = false;
    vi.advanceTimersByTime(150);
    t('b');
    expect(calls).toHaveBeenLastCalledWith('b');
  });
});
