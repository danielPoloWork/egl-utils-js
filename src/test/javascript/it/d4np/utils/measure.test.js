import { describe, it, expect, vi } from 'vitest';
import { measure } from '../../../../../main/javascript/it/d4np/utils/diagnostics.js';

// Example tests (roadmap 5.5, spec §2 item 20) for measure.

describe('measure — sync functions', () => {
  it('returns the function result and a non-negative ms', async () => {
    const { result, ms } = await measure(() => 2 + 2);
    expect(result).toBe(4);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(ms)).toBe(true);
  });

  it('propagates a synchronous throw as a rejection, unwrapped', async () => {
    const boom = new Error('sync blew up');
    await expect(
      measure(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('calls fn exactly once with no arguments', async () => {
    const fn = vi.fn(() => 'x');
    await measure(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith();
  });
});

describe('measure — async functions', () => {
  it('awaits a returned promise and includes its duration in ms', async () => {
    const delayMs = 20;
    const { result, ms } = await measure(
      () => new Promise((resolve) => setTimeout(() => resolve('done'), delayMs)),
    );
    expect(result).toBe('done');
    expect(ms).toBeGreaterThanOrEqual(delayMs - 5); // timer tolerance, not flaky-by-design
  });

  it('propagates a rejected promise unwrapped', async () => {
    const boom = new Error('async blew up');
    await expect(
      measure(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('measures the full async duration, not just the pre-await portion', async () => {
    const { ms } = await measure(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return 'x';
    });
    expect(ms).toBeGreaterThanOrEqual(10);
  });
});

describe('measure — contract', () => {
  it('rejects TypeError for a non-function argument', async () => {
    for (const bad of [42, 'x', null, undefined, {}]) {
      await expect(measure(/** @type {any} */ (bad))).rejects.toThrow(TypeError);
    }
  });

  it('always returns a Promise, even for a purely synchronous fn', () => {
    const outcome = measure(() => 1);
    expect(outcome).toBeInstanceOf(Promise);
  });
});
