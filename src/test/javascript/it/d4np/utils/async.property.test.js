import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  timeout,
  retry,
  parallelLimit,
  asyncQueue,
} from '../../../../../main/javascript/it/d4np/utils/async.js';
import {
  TimeoutError,
  RetryExhaustedError,
} from '../../../../../main/javascript/it/d4np/utils/errors.js';

// Property suites (spec §7, roadmap 2.6) — the template M3/M5 suites copy.
//
// Conventions:
// - `*.property.test.js` holds law-like invariants over generated inputs;
//   example-based edge cases stay in the sibling `*.test.js` files.
// - Every property states its invariant in words above the code.
// - `numRuns` is explicit: logic-only laws run the fast-check default (100);
//   properties bounded by real timers run fewer, noted inline.
// - On failure fast-check reports the seed and counterexample; re-run with
//   `fc.assert(..., { seed })` to replay a shrunk failing case exactly.

describe('retry — attempt-count law (spec §2 item 3)', () => {
  // Invariant: with r retries, a task that fails f times before succeeding is
  // called exactly min(f + 1, r + 1) times, succeeds iff f <= r, and on
  // exhaustion reports attempts = r + 1 with the per-attempt errors in order
  // and the last one as `cause`.
  it('calls fn min(f+1, r+1) times and succeeds iff failures <= retries', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat(6), fc.nat(5), async (failures, retries) => {
        let calls = 0;
        const fn = () => {
          calls += 1;
          if (calls <= failures) {
            return Promise.reject(new Error(`fail ${calls}`));
          }
          return Promise.resolve('ok');
        };

        // minDelay/maxDelay 0 → jittered backoff is 0 ms; properties stay fast.
        const outcome = await retry(fn, { retries, minDelay: 0, maxDelay: 0 }).then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error }),
        );

        expect(calls).toBe(Math.min(failures + 1, retries + 1));
        if (failures <= retries) {
          expect(outcome).toEqual({ ok: true, value: 'ok' });
        } else {
          expect(outcome.ok).toBe(false);
          const err = /** @type {{ error: RetryExhaustedError }} */ (outcome).error;
          expect(err).toBeInstanceOf(RetryExhaustedError);
          expect(err.attempts).toBe(retries + 1);
          expect(err.errors.map((/** @type {Error} */ e) => e.message)).toEqual(
            Array.from({ length: retries + 1 }, (_, i) => `fail ${i + 1}`),
          );
          expect(err.cause).toBe(err.errors[err.errors.length - 1]);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('parallelLimit — order and concurrency laws (spec §2 item 4)', () => {
  // Invariant: for any values and any limit, results equal the input values
  // in input order, and the number of tasks in flight never exceeds `limit`.
  it('preserves input order and never exceeds the concurrency cap', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer(), { maxLength: 12 }),
        fc.integer({ min: 1, max: 8 }),
        fc.array(fc.boolean(), { maxLength: 12 }),
        async (values, limit, slowFlags) => {
          let inFlight = 0;
          let peak = 0;
          const tasks = values.map((value, i) => async () => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            // Random schedule: some tasks yield to a macrotask, some settle
            // in the same microtask turn — order must hold either way.
            if (slowFlags[i % Math.max(slowFlags.length, 1)]) {
              await new Promise((r) => setTimeout(r, 1));
            }
            inFlight -= 1;
            return value;
          });

          const results = await parallelLimit(tasks, limit);
          expect(results).toEqual(values);
          expect(peak).toBeLessThanOrEqual(limit);
        },
      ),
      { numRuns: 75 }, // real 1 ms timers bound the run count
    );
  });

  // Invariant: in settle mode every position i reports exactly its own task's
  // outcome — fulfilled with its value or rejected with its error — and no
  // task failure prevents any other task from running.
  it('settle mode maps every input to its own settled result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ ok: fc.boolean(), value: fc.integer() }), { maxLength: 10 }),
        fc.integer({ min: 1, max: 4 }),
        async (specs, limit) => {
          let started = 0;
          const tasks = specs.map((spec, i) => () => {
            started += 1;
            return spec.ok ? Promise.resolve(spec.value) : Promise.reject(new Error(`err ${i}`));
          });

          const results = await parallelLimit(tasks, limit, { settle: true });
          expect(started).toBe(specs.length); // nothing was skipped
          expect(results).toHaveLength(specs.length);
          results.forEach((result, i) => {
            if (specs[i].ok) {
              expect(result).toEqual({ status: 'fulfilled', value: specs[i].value });
            } else {
              expect(result.status).toBe('rejected');
              expect(/** @type {{ reason: Error }} */ (result).reason.message).toBe(`err ${i}`);
            }
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('asyncQueue — FIFO and serial laws (spec §2 item 5)', () => {
  // Invariant: for any task schedule, execution intervals never overlap (pure
  // serial), tasks start in push order, every push resolves its own value,
  // and the queue ends idle with size 0.
  it('runs any schedule serially, in order, and drains to idle', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), async (slow) => {
        const queue = asyncQueue();
        /** @type {string[]} */
        const log = [];
        let active = 0;
        let overlapped = false;

        const outcomes = slow.map((isSlow, i) =>
          queue.push(async () => {
            active += 1;
            if (active > 1) overlapped = true;
            log.push(`start:${i}`);
            if (isSlow) await new Promise((r) => setTimeout(r, 1));
            log.push(`end:${i}`);
            active -= 1;
            return i;
          }),
        );

        await queue.onIdle();
        expect(overlapped).toBe(false);
        expect(log).toEqual(slow.flatMap((_, i) => [`start:${i}`, `end:${i}`]));
        await expect(Promise.all(outcomes)).resolves.toEqual(slow.map((_, i) => i));
        expect(queue.size).toBe(0);
      }),
      { numRuns: 75 }, // real 1 ms timers bound the run count
    );
  });
});

describe('timeout — identity and deadline laws (spec §2 item 2)', () => {
  // Invariant: under a generous budget, timeout is an identity wrapper — any
  // fulfilled value comes back as-is, any rejection propagates as-is.
  it('is an identity wrapper when the operation beats the budget', async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), fc.boolean(), async (value, shouldFail) => {
        if (shouldFail) {
          const boom = new Error('op failed');
          await expect(timeout(() => Promise.reject(boom), 1_000)).rejects.toBe(boom);
        } else {
          await expect(timeout(() => Promise.resolve(value), 1_000)).resolves.toBe(value);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Invariant: a task that never settles rejects with TimeoutError for any
  // budget, and the task's signal is aborted by then.
  it('rejects TimeoutError for any budget when the task never settles', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (ms) => {
        /** @type {AbortSignal | undefined} */
        let seen;
        const p = timeout((signal) => {
          seen = signal;
          return new Promise(() => {});
        }, ms);
        await expect(p).rejects.toBeInstanceOf(TimeoutError);
        expect(seen?.aborted).toBe(true);
      }),
      { numRuns: 15 }, // each run genuinely waits up to 20 ms of real time
    );
  });
});
