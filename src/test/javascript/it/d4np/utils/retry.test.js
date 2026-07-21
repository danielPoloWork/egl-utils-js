import { describe, it, expect, vi, afterEach } from 'vitest';
import { retry } from '../../../../../main/javascript/it/d4np/utils/async.js';
import {
  AbortError,
  RetryExhaustedError,
} from '../../../../../main/javascript/it/d4np/utils/errors.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A function that rejects `failures` times, then resolves with `value`. */
function failThenSucceed(failures, value) {
  let calls = 0;
  return vi.fn(() => {
    calls += 1;
    return calls <= failures ? Promise.reject(new Error(`fail ${calls}`)) : Promise.resolve(value);
  });
}

describe('retry (spec §2 item 3)', () => {
  it('returns the first result without retrying on success', async () => {
    const fn = vi.fn(() => Promise.resolve('ok'));
    await expect(retry(fn, { minDelay: 1, maxDelay: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resolves once an attempt succeeds within the retry budget', async () => {
    const fn = failThenSucceed(2, 'recovered');
    await expect(retry(fn, { retries: 3, minDelay: 1, maxDelay: 2 })).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rejects RetryExhaustedError with attempts and ordered errors when all fail', async () => {
    const fn = vi.fn((/** @type {any} */) =>
      Promise.reject(new Error(`fail ${fn.mock.calls.length}`)),);
    const p = retry(fn, { retries: 2, minDelay: 1, maxDelay: 2 });
    await expect(p).rejects.toBeInstanceOf(RetryExhaustedError);
    const err = await p.catch((e) => e);
    expect(err.code).toBe('EGL_RETRY_EXHAUSTED');
    expect(err.attempts).toBe(3); // retries: 2 → 3 total attempts
    expect(err.errors).toHaveLength(3);
    expect(err.errors.map((/** @type {Error} */ e) => e.message)).toEqual([
      'fail 1',
      'fail 2',
      'fail 3',
    ]);
    expect(err.cause).toBe(err.errors[2]); // last failure is the cause
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('performs exactly one attempt when retries = 0', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('nope')));
    const p = retry(fn, { retries: 0, minDelay: 1 });
    await expect(p).rejects.toBeInstanceOf(RetryExhaustedError);
    const err = await p.catch((e) => e);
    expect(err.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the caller signal to fn, and undefined when none is given', async () => {
    const controller = new AbortController();
    const withSignal = vi.fn(() => Promise.resolve(1));
    await retry(withSignal, { signal: controller.signal, minDelay: 1 });
    expect(withSignal).toHaveBeenCalledWith(controller.signal);

    const withoutSignal = vi.fn(() => Promise.resolve(1));
    await retry(withoutSignal, { minDelay: 1 });
    expect(withoutSignal).toHaveBeenCalledWith(undefined);
  });
});

describe('retry — full-jitter backoff schedule (spec §2 item 3)', () => {
  it('grows exponentially then caps at maxDelay, scaled by the jitter factor', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // deterministic full jitter
    /** @type {Array<number | undefined>} */
    const schedule = [];
    const fn = vi.fn(() => Promise.reject(new Error('always')));
    const p = retry(fn, {
      retries: 3,
      minDelay: 10,
      maxDelay: 25,
      onAttempt: ({ nextDelay }) => schedule.push(nextDelay),
    });
    p.catch(() => {}); // avoid an unhandled rejection while advancing timers
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeInstanceOf(RetryExhaustedError);

    // ceilings: min(25,10)=10, min(25,20)=20, min(25,40)=25 (capped); *0.5 jitter.
    // The 4th (last) attempt schedules no next delay.
    expect(schedule).toEqual([5, 10, 12.5, undefined]);
  });
});

describe('retry — cancellation is terminal (ADR-0004)', () => {
  it('rejects immediately with AbortError on a pre-aborted signal', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled up front');
    controller.abort(reason);
    const fn = vi.fn();
    const p = retry(fn, { signal: controller.signal });
    await expect(p).rejects.toBeInstanceOf(AbortError);
    await expect(p).rejects.toMatchObject({ code: 'EGL_ABORT', cause: reason });
    expect(fn).not.toHaveBeenCalled();
  });

  it('aborting during the backoff wait rejects AbortError, not RetryExhaustedError', async () => {
    const controller = new AbortController();
    const fn = vi.fn(() => Promise.reject(new Error('fail')));
    const p = retry(fn, {
      retries: 5,
      minDelay: 1_000,
      maxDelay: 1_000,
      signal: controller.signal,
      // Abort right after the first failure, before the (long) backoff elapses.
      onAttempt: () => controller.abort(),
    });
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(fn).toHaveBeenCalledTimes(1); // no second attempt ran
  });

  it('treats a signal aborted during fn as terminal', async () => {
    const controller = new AbortController();
    const fn = vi.fn(
      (/** @type {AbortSignal} */ signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('fn saw abort')), { once: true });
        }),
    );
    const p = retry(fn, { retries: 5, minDelay: 1, signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('retry — onAttempt observability', () => {
  it('reports attempt, error, and retriesLeft for each failed attempt', async () => {
    /** @type {Array<{ attempt: number, retriesLeft: number, message: string }>} */
    const seen = [];
    const fn = failThenSucceed(2, 'ok');
    await retry(fn, {
      retries: 3,
      minDelay: 1,
      maxDelay: 1,
      onAttempt: ({ attempt, error, retriesLeft }) =>
        seen.push({ attempt, retriesLeft, message: /** @type {Error} */ (error).message }),
    });
    expect(seen).toEqual([
      { attempt: 1, retriesLeft: 3, message: 'fail 1' },
      { attempt: 2, retriesLeft: 2, message: 'fail 2' },
    ]);
  });

  it('is not called when the first attempt succeeds', async () => {
    const onAttempt = vi.fn();
    await retry(() => Promise.resolve('ok'), { minDelay: 1, onAttempt });
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('propagates an exception thrown by onAttempt', async () => {
    const boom = new Error('observer blew up');
    const p = retry(() => Promise.reject(new Error('fail')), {
      retries: 3,
      minDelay: 1,
      onAttempt: () => {
        throw boom;
      },
    });
    await expect(p).rejects.toBe(boom);
  });
});

describe('retry — argument validation (programmer errors throw TypeError)', () => {
  it('rejects a non-function fn', async () => {
    await expect(retry(/** @type {any} */ (42))).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects invalid retries', async () => {
    await expect(retry(() => 1, { retries: -1 })).rejects.toBeInstanceOf(TypeError);
    await expect(retry(() => 1, { retries: 1.5 })).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects invalid delays and maxDelay < minDelay', async () => {
    await expect(retry(() => 1, { minDelay: -1 })).rejects.toBeInstanceOf(TypeError);
    await expect(retry(() => 1, { maxDelay: Number.NaN })).rejects.toBeInstanceOf(TypeError);
    await expect(retry(() => 1, { minDelay: 100, maxDelay: 50 })).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects a non-function onAttempt', async () => {
    await expect(retry(() => 1, { onAttempt: /** @type {any} */ (5) })).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});
