import { describe, it, expect, vi } from 'vitest';
import { parallelLimit } from '../../../../../main/javascript/it/d4np/utils/async.js';
import { AbortError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

/**
 * A controllable task: returns a promise plus resolve/reject handles, and
 * records whether it was ever invoked (to assert pending tasks never launch).
 */
function deferredTask() {
  /** @type {(v: any) => void} */
  let resolve = () => {};
  /** @type {(e: any) => void} */
  let reject = () => {};
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  /** @type {AbortSignal | undefined} */
  let signal;
  const task = vi.fn((/** @type {AbortSignal} */ s) => {
    signal = s;
    return promise;
  });
  return {
    task,
    resolve,
    reject,
    get started() {
      return task.mock.calls.length > 0;
    },
    get signal() {
      return signal;
    },
  };
}

describe('parallelLimit (spec §2 item 4)', () => {
  it('preserves input order regardless of settle order', async () => {
    const tasks = [
      () => new Promise((r) => setTimeout(() => r('a'), 20)),
      () => new Promise((r) => setTimeout(() => r('b'), 5)),
      () => new Promise((r) => setTimeout(() => r('c'), 10)),
    ];
    await expect(parallelLimit(tasks, 3)).resolves.toEqual(['a', 'b', 'c']);
  });

  it('never runs more than `limit` tasks at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const make = () => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return true;
    };
    const tasks = Array.from({ length: 8 }, make);
    await parallelLimit(tasks, 3);
    expect(peak).toBe(3);
  });

  it('resolves [] for an empty task list', async () => {
    await expect(parallelLimit([], 4)).resolves.toEqual([]);
  });

  it('runs all tasks when limit exceeds the task count', async () => {
    const tasks = [() => 1, () => 2];
    await expect(parallelLimit(tasks, 10)).resolves.toEqual([1, 2]);
  });
});

describe('parallelLimit — fail-fast (default)', () => {
  it('rejects with the first error and never launches pending tasks', async () => {
    const boom = new Error('first failure');
    const failing = () => Promise.reject(boom);
    const pending = deferredTask();
    // limit 1 → sequential: the first task fails before the second can start.
    const p = parallelLimit([failing, pending.task], 1);
    await expect(p).rejects.toBe(boom);
    expect(pending.started).toBe(false); // pending task never launched
  });

  it('aborts an in-flight sibling that respects the signal', async () => {
    const boom = new Error('sibling failed');
    const longRunner = deferredTask();
    const failing = () => Promise.reject(boom);
    // limit 2 → both start together; longRunner should be aborted when failing rejects.
    const p = parallelLimit([longRunner.task, failing], 2);
    await expect(p).rejects.toBe(boom);
    expect(longRunner.signal?.aborted).toBe(true);
  });

  it('absorbs a straggler that rejects late after settling (no unhandled rejection)', async () => {
    const boom = new Error('boom');
    /** @type {(e: any) => void} */
    let failStraggler = () => {};
    const straggler = () =>
      new Promise((_, rej) => {
        failStraggler = rej;
      });
    const failing = () => Promise.reject(boom);
    const p = parallelLimit([straggler, failing], 2);
    await expect(p).rejects.toBe(boom);
    // The straggler rejects late, after parallelLimit already settled.
    failStraggler(new Error('late straggler failure'));
    await new Promise((r) => setTimeout(r, 10)); // a leaked rejection would surface here
  });

  it('absorbs a straggler that resolves late after settling', async () => {
    const boom = new Error('boom');
    /** @type {(v: any) => void} */
    let resolveStraggler = () => {};
    const straggler = () =>
      new Promise((res) => {
        resolveStraggler = res;
      });
    const failing = () => Promise.reject(boom);
    const p = parallelLimit([straggler, failing], 2);
    await expect(p).rejects.toBe(boom);
    // The straggler resolves late — the success handler must no-op post-settle.
    resolveStraggler('late success');
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe('parallelLimit — settle mode', () => {
  it('returns PromiseSettledResult[] without aborting on failure', async () => {
    const boom = new Error('task 2 failed');
    const tasks = [
      () => Promise.resolve('ok'),
      () => Promise.reject(boom),
      () => Promise.resolve(3),
    ];
    const results = await parallelLimit(tasks, 2, { settle: true });
    expect(results).toEqual([
      { status: 'fulfilled', value: 'ok' },
      { status: 'rejected', reason: boom },
      { status: 'fulfilled', value: 3 },
    ]);
  });

  it('runs every task to completion even when one fails early', async () => {
    const later = vi.fn(() => Promise.resolve('later ran'));
    const tasks = [() => Promise.reject(new Error('early')), later];
    const results = await parallelLimit(tasks, 1, { settle: true });
    expect(later).toHaveBeenCalledTimes(1);
    expect(results[1]).toEqual({ status: 'fulfilled', value: 'later ran' });
  });

  it('resolves when the final task to settle is a rejection', async () => {
    /** @type {(e: any) => void} */
    let rejectLast = () => {};
    const boom = new Error('last fails');
    const tasks = [
      () => Promise.resolve('first'),
      () =>
        new Promise((_, rej) => {
          rejectLast = rej;
        }),
    ];
    const p = parallelLimit(tasks, 2, { settle: true });
    await Promise.resolve(); // let the first task fulfill
    rejectLast(boom); // the last task to settle is a rejection
    await expect(p).resolves.toEqual([
      { status: 'fulfilled', value: 'first' },
      { status: 'rejected', reason: boom },
    ]);
  });
});

describe('parallelLimit — cancellation is terminal (ADR-0004)', () => {
  it('rejects immediately with AbortError on a pre-aborted signal, launching nothing', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled up front');
    controller.abort(reason);
    const task = vi.fn(() => Promise.resolve(1));
    const p = parallelLimit([task], 1, { signal: controller.signal });
    await expect(p).rejects.toBeInstanceOf(AbortError);
    await expect(p).rejects.toMatchObject({ code: 'EGL_ABORT', cause: reason });
    expect(task).not.toHaveBeenCalled();
  });

  it('rejects AbortError when the caller aborts mid-run (fail-fast mode)', async () => {
    const controller = new AbortController();
    const runner = deferredTask();
    const p = parallelLimit([runner.task], 1, { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(runner.signal?.aborted).toBe(true);
  });

  it('rejects AbortError when the caller aborts mid-run (settle mode too)', async () => {
    const controller = new AbortController();
    const runner = deferredTask();
    const p = parallelLimit([runner.task], 1, { signal: controller.signal, settle: true });
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});

describe('parallelLimit — argument validation (TypeError)', () => {
  it('rejects a non-array tasks or a non-function entry', () => {
    expect(() => parallelLimit(/** @type {any} */ ('nope'), 1)).toThrow(TypeError);
    expect(() => parallelLimit([() => 1, /** @type {any} */ (42)], 1)).toThrow(TypeError);
  });

  it('rejects a non-positive or non-integer limit', () => {
    expect(() => parallelLimit([() => 1], 0)).toThrow(TypeError);
    expect(() => parallelLimit([() => 1], -1)).toThrow(TypeError);
    expect(() => parallelLimit([() => 1], 1.5)).toThrow(TypeError);
  });
});
