import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { delay, timeout } from '../../../../../main/javascript/it/d4np/utils/async.js';
import { AbortError, TimeoutError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

// delay is driven by setTimeout, which fake timers control.
describe('delay (spec §2 item 1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after ms', async () => {
    let resolved = false;
    const p = delay(200).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(199);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(resolved).toBe(true);
  });

  it('accepts ms = 0', async () => {
    const p = delay(0);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBeUndefined();
  });

  it('throws TypeError on a non-finite or negative ms (programmer error, ADR-0004)', () => {
    expect(() => delay(-1)).toThrow(TypeError);
    expect(() => delay(Number.NaN)).toThrow(TypeError);
    expect(() => delay(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => delay(/** @type {any} */ ('100'))).toThrow(TypeError);
  });

  it('rejects immediately with AbortError on a pre-aborted signal, starting no timer', async () => {
    const controller = new AbortController();
    const reason = new Error('user cancelled');
    controller.abort(reason);
    const timerCount = vi.getTimerCount();
    const p = delay(1_000, { signal: controller.signal });
    await expect(p).rejects.toBeInstanceOf(AbortError);
    await expect(p).rejects.toMatchObject({ code: 'EGL_ABORT', cause: reason });
    expect(vi.getTimerCount()).toBe(timerCount); // no timer was installed
  });

  it('rejects with AbortError and clears its timer when aborted mid-wait', async () => {
    const controller = new AbortController();
    const p = delay(1_000, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(300);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError', code: 'EGL_ABORT' });
    expect(vi.getTimerCount()).toBe(0); // timer cleared, nothing left pending
  });

  it('removes its abort listener after resolving (no leak on long-lived signals)', async () => {
    const controller = new AbortController();
    const p = delay(50, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBeUndefined();
    // Aborting after settlement must not do anything observable.
    controller.abort();
    await expect(p).resolves.toBeUndefined();
  });
});

// timeout is driven by AbortSignal.timeout, which fake timers cannot
// intercept on Node (ADR-0004 testing note) — real short timers instead.
describe('timeout (spec §2 item 2)', () => {
  it('resolves with the task value when it settles inside the budget', async () => {
    await expect(timeout(() => Promise.resolve(42), 1_000)).resolves.toBe(42);
  });

  it('accepts a bare promise inside the budget', async () => {
    await expect(timeout(Promise.resolve('ok'), 1_000)).resolves.toBe('ok');
  });

  it('rejects with TimeoutError (EGL_TIMEOUT) at the deadline', async () => {
    const never = () => new Promise(() => {});
    const p = timeout(never, 30);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    await expect(p).rejects.toMatchObject({ code: 'EGL_TIMEOUT' });
    await expect(p).rejects.toThrow('timed out after 30 ms');
  });

  it('hands the task a signal that aborts at the deadline — the operation can actually stop', async () => {
    /** @type {AbortSignal | undefined} */
    let seen;
    const task = (/** @type {AbortSignal} */ signal) => {
      seen = signal;
      return new Promise((_, rejectTask) => {
        signal.addEventListener('abort', () => rejectTask(signal.reason), { once: true });
      });
    };
    await expect(timeout(task, 30)).rejects.toBeInstanceOf(TimeoutError);
    expect(seen?.aborted).toBe(true); // the underlying operation observed the abort
  });

  it('propagates the task/promise failure as-is inside the budget', async () => {
    const boom = new Error('boom');
    await expect(timeout(() => Promise.reject(boom), 1_000)).rejects.toBe(boom);
    await expect(timeout(Promise.reject(boom), 1_000)).rejects.toBe(boom);
  });

  it('treats a synchronously-throwing task as a rejection', async () => {
    const boom = new Error('sync boom');
    await expect(
      timeout(() => {
        throw boom;
      }, 1_000),
    ).rejects.toBe(boom);
  });

  it('rejects with AbortError, not TimeoutError, when the caller signal aborts first', async () => {
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    const p = timeout(() => new Promise(() => {}), 5_000, { signal: controller.signal });
    controller.abort(reason);
    await expect(p).rejects.toBeInstanceOf(AbortError);
    await expect(p).rejects.toMatchObject({ code: 'EGL_ABORT', cause: reason });
  });

  it('the merged signal reaches the task when the caller aborts', async () => {
    const controller = new AbortController();
    /** @type {AbortSignal | undefined} */
    let seen;
    const p = timeout(
      (/** @type {AbortSignal} */ signal) => {
        seen = signal;
        return new Promise(() => {});
      },
      5_000,
      { signal: controller.signal },
    );
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(seen?.aborted).toBe(true);
  });

  it('rejects immediately on a pre-aborted caller signal without invoking the task', async () => {
    const controller = new AbortController();
    controller.abort();
    const task = vi.fn();
    await expect(timeout(task, 1_000, { signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(task).not.toHaveBeenCalled();
  });

  it('absorbs the operation settling late after a timeout (no unhandled rejection)', async () => {
    // The suite runs with unhandled-error detection on; if the late rejection
    // leaked, vitest would fail this file.
    /** @type {(err: Error) => void} */
    let failLater = () => {};
    const p = timeout(
      () =>
        new Promise((_, rejectTask) => {
          failLater = rejectTask;
        }),
      20,
    );
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    failLater(new Error('late failure after the deadline'));
    await new Promise((r) => setTimeout(r, 10)); // give a leak the chance to surface
  });

  it('throws TypeError on an invalid ms budget', () => {
    expect(() => timeout(Promise.resolve(), -5)).toThrow(TypeError);
    expect(() => timeout(Promise.resolve(), Number.NaN)).toThrow(TypeError);
  });

  it('merge tolerates a signal aborting between the entry check and the merge (TOCTOU)', async () => {
    // White-box race coverage for the internal anySignal helper (ADR-0004),
    // which 2.3–2.5 reuse with arbitrary caller signals: a signal that reads
    // as live at the entry check but aborted by merge time must still produce
    // an aborted merged signal for the task.
    const reason = new Error('raced');
    let first = true;
    const racedSignal = /** @type {AbortSignal} */ (
      /** @type {unknown} */ ({
        get aborted() {
          if (first) {
            first = false;
            return false; // the entry check sees a live signal
          }
          return true; // the merge sees it already aborted
        },
        reason,
        addEventListener() {},
        removeEventListener() {},
      })
    );
    const p = timeout(
      (/** @type {AbortSignal} */ signal) =>
        signal.aborted ? Promise.reject(signal.reason) : new Promise(() => {}),
      5_000,
      { signal: racedSignal },
    );
    await expect(p).rejects.toBe(reason); // the task observed the abort through the merged signal
  });
});

// Roadmap 7.6 (release-readiness review): `AbortSignal.timeout` landed in
// Safari 16.0, but spec §3 NFR-07 declares Safari >= 15.4 supported. Calling it
// unconditionally made `timeout` — and `httpClient`, which composes it — throw
// `TypeError: AbortSignal.timeout is not a function` on Safari 15.4–15.6. The
// internal fallback is exercised here by removing the static, which is the only
// way to reach that branch on a runtime that has it.
describe('timeout — fallback where AbortSignal.timeout is unavailable (NFR-07, Safari 15.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** A Safari-15.4-shaped AbortSignal: everything except the `timeout` static. */
  function withoutTimeoutStatic() {
    const Patched = class extends AbortSignal {};
    // Copy the statics the library relies on, minus `timeout`.
    Object.defineProperty(Patched, 'abort', { value: AbortSignal.abort });
    vi.stubGlobal(
      'AbortSignal',
      new Proxy(AbortSignal, {
        get(target, property, receiver) {
          if (property === 'timeout') return undefined;
          return Reflect.get(target, property, receiver);
        },
      }),
    );
  }

  it('still rejects with TimeoutError at the deadline', async () => {
    withoutTimeoutStatic();
    vi.resetModules();
    const { timeout: patched } =
      await import('../../../../../main/javascript/it/d4np/utils/async.js');
    expect(AbortSignal.timeout).toBeUndefined(); // the branch under test is reachable

    const error = await patched(() => new Promise(() => {}), 30).catch((e) => e);
    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe('EGL_TIMEOUT');
  });

  it('still hands the operation a signal that aborts on timeout', async () => {
    withoutTimeoutStatic();
    vi.resetModules();
    const { timeout: patched } =
      await import('../../../../../main/javascript/it/d4np/utils/async.js');

    /** @type {AbortSignal | undefined} */
    let observed;
    await patched((signal) => {
      observed = signal;
      return new Promise(() => {});
    }, 30).catch(() => {});
    expect(observed?.aborted).toBe(true);
    // The fallback mirrors the platform's reason, so downstream code that
    // inspects it (e.g. httpClient's fetch) behaves identically.
    expect(/** @type {any} */ (observed).reason?.name).toBe('TimeoutError');
  });

  it('resolves normally when the operation beats the deadline', async () => {
    withoutTimeoutStatic();
    vi.resetModules();
    const { timeout: patched } =
      await import('../../../../../main/javascript/it/d4np/utils/async.js');
    await expect(patched(async () => 'ok', 200)).resolves.toBe('ok');
  });
});
