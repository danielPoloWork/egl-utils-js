import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../../../../main/javascript/it/d4np/utils/events.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('debounce — trailing edge (default, spec §2 item 7)', () => {
  it('invokes once, delay ms after the last call, with the latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d('b');
    d('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('c'); // latest args win
  });

  it('resets the quiet period on each call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(80);
    d(); // restarts the 100 ms window
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled(); // 160 ms elapsed but only 80 since last call
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('forwards `this` to the wrapped function', () => {
    const seen = { via: /** @type {unknown} */ (null) };
    const d = debounce(function boundTarget() {
      seen.via = this;
    }, 50);
    const ctx = { name: 'ctx' };
    d.call(ctx);
    vi.advanceTimersByTime(50);
    expect(seen.via).toBe(ctx);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.debounce).toBe(debounce);
  });
});

describe('debounce — leading edge', () => {
  it('with leading:true, a lone call fires exactly once (no trailing double-invoke)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { leading: true });
    d('x');
    expect(fn).toHaveBeenCalledTimes(1); // leading
    expect(fn).toHaveBeenLastCalledWith('x');
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1); // no trailing for a lone call
  });

  it('with leading:true, a multi-call burst fires on both edges (first + last args)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { leading: true });
    d('first');
    d('second');
    d('third');
    expect(fn).toHaveBeenCalledTimes(1); // leading, with first args
    expect(fn).toHaveBeenLastCalledWith('first');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // trailing, with last args
    expect(fn).toHaveBeenLastCalledWith('third');
  });
});

describe('debounce — maxWait (the classically bug-prone interplay)', () => {
  it('invokes at least every maxWait ms during a sustained burst', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { maxWait: 250 });
    // Call every 40 ms — faster than delay, so plain debounce would never fire
    // until the burst stops; maxWait forces periodic invocation.
    for (let elapsed = 0; elapsed < 500; elapsed += 40) {
      d(elapsed);
      vi.advanceTimersByTime(40);
    }
    // Over 500 ms with maxWait 250, fn must have fired at least twice mid-burst.
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('clamps maxWait up to delay when a smaller maxWait is given', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { maxWait: 10 }); // effective maxWait = 100
    d();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled(); // would have fired at 10 ms if not clamped
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('leading + maxWait together: leading fires immediately, maxWait bounds the rest', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { leading: true, maxWait: 200 });
    d(0);
    expect(fn).toHaveBeenCalledTimes(1); // leading
    for (let elapsed = 40; elapsed <= 400; elapsed += 40) {
      d(elapsed);
      vi.advanceTimersByTime(40);
    }
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3); // leading + maxWait-forced invokes
  });
});

describe('debounce — maxWait during a synchronous burst (real timers)', () => {
  it('invokes synchronously when a call arrives past maxWait with the timer still pending', () => {
    // Under fake timers the maxWait-boundary timer always fires first, so this
    // path only manifests in real time: a synchronous burst blocks the event
    // loop, so the pending setTimeout cannot run and the *call* enforces
    // maxWait instead. Small durations keep the test ~40 ms.
    vi.useRealTimers();
    const fn = vi.fn();
    const d = debounce(fn, 20, { maxWait: 30 });
    /** @param {number} ms */
    const busyWait = (ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        // spin: block the event loop so the pending timer cannot fire
      }
    };
    d(1); // leading edge (no leading invoke): schedules the timer
    expect(fn).not.toHaveBeenCalled();
    busyWait(40); // exceed maxWait synchronously; the setTimeout stays queued
    d(2); // sinceInvoke >= maxWait with a pending timer → synchronous invoke
    // Asserted synchronously, before yielding — no timer callback has run yet.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(2);
    d.cancel(); // drop the still-queued timer
  });
});

describe('debounce — cancel / flush', () => {
  it('cancel drops the pending trailing invocation', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel resets state so the next call starts a fresh window', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d.cancel();
    d('b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('b');
  });

  it('flush invokes the pending call immediately and returns its result', () => {
    const fn = vi.fn((x) => `result:${x}`);
    const d = debounce(fn, 100);
    d('a');
    expect(fn).not.toHaveBeenCalled();
    const flushed = d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(flushed).toBe('result:a');
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1); // nothing left pending
  });

  it('flush with nothing pending returns the last result and invokes nothing', () => {
    const fn = vi.fn((x) => x);
    const d = debounce(fn, 100);
    d(1);
    vi.advanceTimersByTime(100); // trailing fires → result is 1
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.flush()).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('the debounced function returns the most recent invocation result', () => {
    const fn = vi.fn((x) => x * 2);
    const d = debounce(fn, 100, { leading: true });
    expect(d(5)).toBe(10); // leading invoke returns synchronously
  });
});

describe('debounce — argument validation (TypeError)', () => {
  it('rejects a non-function fn and invalid delay/maxWait', () => {
    expect(() => debounce(/** @type {any} */ (42), 100)).toThrow(TypeError);
    expect(() => debounce(() => {}, -1)).toThrow(TypeError);
    expect(() => debounce(() => {}, Number.NaN)).toThrow(TypeError);
    expect(() => debounce(() => {}, 100, { maxWait: -1 })).toThrow(TypeError);
    expect(() => debounce(() => {}, 100, { maxWait: /** @type {any} */ ('x') })).toThrow(TypeError);
  });
});
