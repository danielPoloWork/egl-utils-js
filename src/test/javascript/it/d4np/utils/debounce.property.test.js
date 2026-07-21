import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { debounce } from '../../../../../main/javascript/it/d4np/utils/events.js';

// Property suite (roadmap 2.6 template) for debounce. Fake timers are driven
// deterministically inside each property run; vi.clearAllTimers() between runs
// prevents one iteration's pending timer from bleeding into the next.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('debounce — invocation-bound laws (spec §2 item 7)', () => {
  // Invariant: for any call schedule, debounce never invokes fn more times
  // than it was called, always invokes at least once (a trailing edge always
  // eventually fires), and every invocation's argument came from a real call.
  it('never over-invokes and only ever forwards real call arguments', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ arg: fc.integer(), gap: fc.integer({ min: 0, max: 250 }) }), {
          minLength: 1,
          maxLength: 30,
        }),
        fc.option(fc.integer({ min: 1, max: 300 }), { nil: undefined }),
        (schedule, maxWait) => {
          vi.clearAllTimers();
          const seen = new Set(schedule.map((s) => s.arg));
          const fn = vi.fn();
          const d = debounce(fn, 100, maxWait === undefined ? {} : { maxWait });

          for (const { arg, gap } of schedule) {
            d(arg);
            vi.advanceTimersByTime(gap);
          }
          vi.advanceTimersByTime(400); // drain any pending trailing invocation

          expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1);
          expect(fn.mock.calls.length).toBeLessThanOrEqual(schedule.length);
          for (const call of fn.mock.calls) {
            expect(seen.has(call[0])).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Invariant: after the timers fully drain, the LAST invocation always
  // carried the LAST scheduled argument (trailing edge uses the most recent
  // call), regardless of leading/maxWait configuration.
  it('the final invocation always carries the most recent argument', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
        fc.boolean(),
        (args, leading) => {
          vi.clearAllTimers();
          const fn = vi.fn();
          const d = debounce(fn, 100, { leading });
          for (const arg of args) d(arg);
          vi.advanceTimersByTime(400);
          const lastCall = fn.mock.calls.at(-1);
          expect(lastCall?.[0]).toBe(args.at(-1));
        },
      ),
      { numRuns: 100 },
    );
  });
});
