import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { measure } from '../../../../../main/javascript/it/d4np/utils/diagnostics.js';

// Property suite (roadmap 2.6 template) for measure (spec §2 item 20).

describe('measure — timing and result laws', () => {
  // Invariant: for any return value (sync or wrapped in a resolved promise),
  // measure resolves that exact value and a finite non-negative ms.
  it('resolves any value unchanged, sync or via a resolved promise, with finite non-negative ms', async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), fc.boolean(), async (value, async_) => {
        const { result, ms } = await measure(() => (async_ ? Promise.resolve(value) : value));
        expect(result).toBe(value);
        expect(Number.isFinite(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });

  // Invariant: measure's reported ms is always at least the artificial delay
  // injected via a real timer — a lower bound, never a fabricated or clamped
  // number. Small delays and a moderate run count keep the suite fast.
  it('ms is at least as large as an injected real-timer delay', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 30 }), async (delayMs) => {
        const { ms } = await measure(() => new Promise((resolve) => setTimeout(resolve, delayMs)));
        expect(ms).toBeGreaterThanOrEqual(delayMs - 2); // timer-granularity tolerance
      }),
      { numRuns: 15 },
    );
  });
});
