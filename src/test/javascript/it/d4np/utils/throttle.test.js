import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from '../../../../../main/javascript/it/d4np/utils/events.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('throttle (spec §2 item 8)', () => {
  it('fires immediately on the leading edge', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');
  });

  it('invokes at most once per interval under a steady stream of calls', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    // Call every 20 ms for 500 ms → 25 calls; throttle should fire ~ once per
    // 100 ms, so far fewer than the call count and bounded by duration/interval.
    for (let elapsed = 0; elapsed < 500; elapsed += 20) {
      t(elapsed);
      vi.advanceTimersByTime(20);
    }
    // Leading at 0, then one per 100 ms across 500 ms: ~6 invocations, never 25.
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(7);
  });

  it('delivers a trailing invocation with the latest args after a burst', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('first'); // leading
    t('second');
    t('third');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('first');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('third'); // trailing, latest args
  });

  it('a single call fires exactly once (leading only, no trailing double-invoke)', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('x');
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('forwards `this` to the wrapped function', () => {
    const seen = { via: /** @type {unknown} */ (null) };
    const t = throttle(function target() {
      seen.via = this;
    }, 50);
    const ctx = { name: 'ctx' };
    t.call(ctx);
    expect(seen.via).toBe(ctx); // leading invoke is synchronous
  });

  it('cancel drops the pending trailing invocation', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t('a'); // leading fires
    t('b'); // schedules trailing
    t.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1); // only the leading invoke ran
  });

  it('flush runs the pending trailing invocation immediately', () => {
    const fn = vi.fn((x) => `r:${x}`);
    const t = throttle(fn, 100);
    t('a'); // leading
    t('b'); // pending trailing
    const flushed = t.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(flushed).toBe('r:b');
  });

  it('returns the leading invocation result synchronously', () => {
    const t = throttle((x) => x * 3, 100);
    expect(t(4)).toBe(12);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.throttle).toBe(throttle);
  });
});

describe('throttle — argument validation (TypeError)', () => {
  it('rejects a non-function fn and an invalid interval', () => {
    expect(() => throttle(/** @type {any} */ (42), 100)).toThrow(TypeError);
    expect(() => throttle(() => {}, -1)).toThrow(TypeError);
    expect(() => throttle(() => {}, Number.NaN)).toThrow(TypeError);
    expect(() => throttle(() => {}, /** @type {any} */ ('x'))).toThrow(TypeError);
  });
});
