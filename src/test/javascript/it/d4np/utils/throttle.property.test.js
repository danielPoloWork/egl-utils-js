import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { throttle } from '../../../../../main/javascript/it/d4np/utils/events.js';

// Property suite (roadmap 2.6 template) for throttle. Fake timers driven
// deterministically per run; cleared between runs.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('throttle — rate-bound laws (spec §2 item 8)', () => {
  // Invariant: across a call schedule of total duration D with interval I,
  // throttle invokes fn no more than the classic throttle bound
  // (leading + one per interval over the elapsed span) — and never more than
  // it was called. Every invocation forwards a real call argument.
  it('never exceeds the per-interval rate bound and only forwards real args', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ arg: fc.integer(), gap: fc.integer({ min: 0, max: 120 }) }), {
          minLength: 1,
          maxLength: 40,
        }),
        fc.integer({ min: 1, max: 100 }),
        (schedule, interval) => {
          vi.clearAllTimers();
          const seen = new Set(schedule.map((s) => s.arg));
          const fn = vi.fn();
          const t = throttle(fn, interval);

          let elapsed = 0;
          for (const { arg, gap } of schedule) {
            t(arg);
            vi.advanceTimersByTime(gap);
            elapsed += gap;
          }
          vi.advanceTimersByTime(interval); // drain the trailing invocation

          // Classic throttle bound over the FULL timeline (the active span plus
          // the trailing-drain interval): a leading call, at most one invoke per
          // interval across that timeline, and a final trailing invoke.
          const bound = 2 + Math.ceil((elapsed + interval) / interval);
          expect(fn.mock.calls.length).toBeLessThanOrEqual(bound);
          expect(fn.mock.calls.length).toBeLessThanOrEqual(schedule.length);
          expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1); // leading always fires
          for (const call of fn.mock.calls) {
            expect(seen.has(call[0])).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Invariant: the very first invocation is synchronous (leading edge) and
  // carries the first scheduled argument.
  it('always invokes synchronously on the first call with the first argument', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 100 }),
        (args, interval) => {
          vi.clearAllTimers();
          const fn = vi.fn();
          const t = throttle(fn, interval);
          t(args[0]);
          expect(fn).toHaveBeenCalledTimes(1); // leading, before any timer
          expect(fn.mock.calls[0][0]).toBe(args[0]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
