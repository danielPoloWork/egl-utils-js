import { describe, it, expect } from 'vitest';
import { asyncQueue } from '../../../../../main/javascript/it/d4np/utils/async.js';
import { AbortError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

/** A manually-settled deferred with a spy task. */
function deferred() {
  /** @type {(v: any) => void} */
  let resolve = () => {};
  /** @type {(e: any) => void} */
  let reject = () => {};
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('asyncQueue (spec §2 item 5)', () => {
  it('runs tasks serially in FIFO order, never overlapping', async () => {
    const queue = asyncQueue();
    /** @type {string[]} */
    const events = [];
    let active = 0;
    const make = (/** @type {string} */ id) => async () => {
      active += 1;
      expect(active).toBe(1); // serial: only ever one in flight
      events.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`end:${id}`);
      active -= 1;
      return id;
    };
    const results = await Promise.all([
      queue.push(make('a')),
      queue.push(make('b')),
      queue.push(make('c')),
    ]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(events).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  });

  it('push resolves and rejects with the task outcome independently', async () => {
    const queue = asyncQueue();
    const boom = new Error('task b failed');
    const a = queue.push(() => 'a-value');
    const b = queue.push(() => Promise.reject(boom));
    const c = queue.push(() => Promise.resolve('c-value'));
    await expect(a).resolves.toBe('a-value');
    await expect(b).rejects.toBe(boom); // one task failing does not stop the queue
    await expect(c).resolves.toBe('c-value');
  });

  it('reports size as waiting plus the running task, decreasing as tasks settle', async () => {
    // Flush to a macrotask boundary so all microtasks — the queue's internal
    // `.finally` that advances to the next task — have run before each check.
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const queue = asyncQueue();
    const first = deferred();
    const second = deferred();
    const p1 = queue.push(() => first.promise);
    const p2 = queue.push(() => second.promise);
    expect(queue.size).toBe(2); // one running (p1) + one waiting (p2)
    first.resolve('one');
    await flush();
    expect(queue.size).toBe(1); // p1 settled, p2 now running
    second.resolve('two');
    await flush();
    expect(queue.size).toBe(0);
    await Promise.all([p1, p2]);
  });

  it('passes the queue signal to each task', async () => {
    const controller = new AbortController();
    const queue = asyncQueue({ signal: controller.signal });
    /** @type {AbortSignal | undefined} */
    let seen;
    await queue.push((signal) => {
      seen = signal;
      return 1;
    });
    expect(seen).toBe(controller.signal);
  });
});

describe('asyncQueue — onIdle', () => {
  it('resolves immediately when the queue is already idle', async () => {
    const queue = asyncQueue();
    await expect(queue.onIdle()).resolves.toBeUndefined();
  });

  it('resolves once all queued work drains', async () => {
    const queue = asyncQueue();
    let done = false;
    queue.push(() => new Promise((r) => setTimeout(r, 5)));
    queue.push(() => new Promise((r) => setTimeout(r, 5)));
    const idle = queue.onIdle().then(() => {
      done = true;
    });
    expect(done).toBe(false);
    await idle;
    expect(done).toBe(true);
    expect(queue.size).toBe(0);
  });

  it('supports multiple concurrent onIdle waiters', async () => {
    const queue = asyncQueue();
    queue.push(() => new Promise((r) => setTimeout(r, 5)));
    await expect(Promise.all([queue.onIdle(), queue.onIdle()])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe('asyncQueue — abort drains pending (ADR-0004)', () => {
  it('rejects every queued-but-not-started task with AbortError', async () => {
    const controller = new AbortController();
    const queue = asyncQueue({ signal: controller.signal });
    const running = deferred();
    const p1 = queue.push(() => running.promise); // starts immediately
    const p2 = queue.push(() => 'never runs'); // waiting
    const p3 = queue.push(() => 'never runs'); // waiting
    const reason = new Error('queue cancelled');
    controller.abort(reason);
    await expect(p2).rejects.toBeInstanceOf(AbortError);
    await expect(p2).rejects.toMatchObject({ code: 'EGL_ABORT', cause: reason });
    await expect(p3).rejects.toBeInstanceOf(AbortError);
    // The running task is left to finish on its own.
    running.resolve('finished');
    await expect(p1).resolves.toBe('finished');
  });

  it('rejects a push after abort immediately with AbortError', async () => {
    const controller = new AbortController();
    const queue = asyncQueue({ signal: controller.signal });
    controller.abort();
    await expect(queue.push(() => 1)).rejects.toBeInstanceOf(AbortError);
  });

  it('rejects push on a pre-aborted signal and reports onIdle as idle', async () => {
    const controller = new AbortController();
    controller.abort();
    const queue = asyncQueue({ signal: controller.signal });
    await expect(queue.push(() => 1)).rejects.toBeInstanceOf(AbortError);
    await expect(queue.onIdle()).resolves.toBeUndefined();
  });

  it('settles pending onIdle waiters when aborted with nothing running', async () => {
    const controller = new AbortController();
    const queue = asyncQueue({ signal: controller.signal });
    const idle = queue.onIdle(); // idle now → resolves immediately anyway
    controller.abort();
    await expect(idle).resolves.toBeUndefined();
  });

  it('resolves onIdle after a running task finishes post-abort', async () => {
    const controller = new AbortController();
    const queue = asyncQueue({ signal: controller.signal });
    const running = deferred();
    queue.push(() => running.promise);
    const drained = queue.push(() => 'drained'); // waiting → aborted
    const idle = queue.onIdle();
    controller.abort();
    running.resolve('done');
    await expect(drained).rejects.toBeInstanceOf(AbortError); // pending task drained
    await expect(idle).resolves.toBeUndefined();
    expect(queue.size).toBe(0);
  });
});

describe('asyncQueue — argument validation', () => {
  it('throws TypeError when push receives a non-function', () => {
    const queue = asyncQueue();
    expect(() => queue.push(/** @type {any} */ (42))).toThrow(TypeError);
  });
});
