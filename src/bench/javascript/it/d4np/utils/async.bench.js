import { bench, describe } from 'vitest';
import { BENCH_OPTIONS } from './options.js';
import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { retry, parallelLimit } from '../../../../../main/javascript/it/d4np/utils/index.js';
import { immediateTasks } from './fixtures.js';

// NFR-04 parity benchmarks for the async combinators against pinned p-retry
// and p-limit (roadmap 7.1). Methodology: ADR-0013.
//
// THE TRAP THIS FILE AVOIDS. Both combinators are normally dominated by
// WAITING, not by code: with default options a retry benchmark measures
// hundreds of milliseconds of backoff and a concurrency benchmark measures the
// tasks. Two implementations would then look identical, and the "parity" claim
// would be a measurement of `setTimeout`.
//
// So every delay is set to zero on BOTH sides and every task resolves
// immediately. What is measured is orchestration overhead — the only part
// either library controls. These numbers therefore say nothing about
// real-world retry latency, which is dominated by the backoff the caller
// chose, and that limit is stated rather than left for a reader to infer.

/** Zero-backoff configuration for our retry. */
const EGL_NO_BACKOFF = { retries: 5, minDelay: 0, maxDelay: 0 };

/**
 * Zero-backoff configuration for p-retry. `factor: 1` plus `randomize: false`
 * is what makes its schedule flat and comparable to ours.
 */
const P_RETRY_NO_BACKOFF = {
  retries: 5,
  minTimeout: 0,
  maxTimeout: 0,
  factor: 1,
  randomize: false,
};

/**
 * A task that fails `failures` times and then succeeds. Fresh per invocation
 * so the two libraries see identical work.
 *
 * @param {number} failures
 * @returns {() => Promise<string>}
 */
function failingTask(failures) {
  let attempts = 0;
  return async () => {
    if (attempts++ < failures) throw new Error('transient');
    return 'ok';
  };
}

describe('retry — immediate success (pure overhead, no timers involved)', () => {
  bench(
    'egl retry',
    async () => {
      await retry(async () => 'ok', EGL_NO_BACKOFF);
    },
    BENCH_OPTIONS,
  );

  bench(
    'p-retry',
    async () => {
      await pRetry(async () => 'ok', P_RETRY_NO_BACKOFF);
    },
    BENCH_OPTIONS,
  );
});

describe('retry — two transient failures, zero backoff (orchestration overhead)', () => {
  // Even at zero delay this path crosses at least one timer boundary per
  // attempt, so it measures scheduling plus bookkeeping, not raw CPU.
  bench(
    'egl retry',
    async () => {
      await retry(failingTask(2), EGL_NO_BACKOFF);
    },
    BENCH_OPTIONS,
  );

  bench(
    'p-retry',
    async () => {
      await pRetry(failingTask(2), P_RETRY_NO_BACKOFF);
    },
    BENCH_OPTIONS,
  );
});

describe('parallelLimit vs p-limit — 100 immediate tasks, concurrency 4', () => {
  // FAIRNESS: p-limit hands back a limiter that the caller must wire into
  // `Promise.all(tasks.map(...))` itself. That wrapper is the user's code for
  // achieving what one parallelLimit call achieves, so it belongs INSIDE the
  // timed region — excluding it would measure two different jobs.
  //
  // DISCLOSURE: ours additionally preserves input order in its results and
  // arms a shared abort signal for fail-fast, work p-limit does not do.
  bench(
    'egl parallelLimit(tasks, 4)',
    async () => {
      await parallelLimit(immediateTasks(100), 4);
    },
    BENCH_OPTIONS,
  );

  bench(
    'p-limit + Promise.all wrapper',
    async () => {
      const limit = pLimit(4);
      await Promise.all(immediateTasks(100).map((task) => limit(task)));
    },
    BENCH_OPTIONS,
  );
});

describe('parallelLimit vs p-limit — 1000 immediate tasks, concurrency 16', () => {
  bench(
    'egl parallelLimit(tasks, 16)',
    async () => {
      await parallelLimit(immediateTasks(1000), 16);
    },
    BENCH_OPTIONS,
  );

  bench(
    'p-limit + Promise.all wrapper',
    async () => {
      const limit = pLimit(16);
      await Promise.all(immediateTasks(1000).map((task) => limit(task)));
    },
    BENCH_OPTIONS,
  );
});

describe('parallelLimit settle mode — no baseline (absolute only)', () => {
  // p-limit has no settle-all equivalent, so there is no parity claim to make
  // here. Recorded as an absolute number for the regression gate (roadmap 7.2).
  bench(
    'egl parallelLimit(tasks, 16, { settle: true })',
    async () => {
      await parallelLimit(immediateTasks(1000), 16, { settle: true });
    },
    BENCH_OPTIONS,
  );
});
