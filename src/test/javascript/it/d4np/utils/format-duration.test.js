import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  parseDuration,
} from '../../../../../main/javascript/it/d4np/utils/diagnostics.js';

// Example tests (roadmap 9.4, spec 02 §2 item F36, ADR-0009/ADR-0023) for
// formatDuration.

describe('formatDuration — spec examples', () => {
  it('emits descending segments, omitting the zero-valued ones', () => {
    expect(formatDuration(5_400_000)).toBe('1h30m');
    expect(formatDuration(61_000)).toBe('1m1s');
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(1_800_000)).toBe('30m');
    expect(formatDuration(5_000)).toBe('5s');
  });

  it('skips a zero middle segment rather than padding it', () => {
    expect(formatDuration(3_601_000)).toBe('1h1s');
  });

  it('floors to 0s rather than rounding up a second that never elapsed', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(1)).toBe('0s');
    expect(formatDuration(999)).toBe('0s');
    expect(formatDuration(1_999)).toBe('1s');
  });

  it('accepts the fractional milliseconds measure() produces', () => {
    expect(formatDuration(1234.5678)).toBe('1s');
    expect(formatDuration(90_500.25)).toBe('1m30s');
  });

  it('handles the largest supported duration', () => {
    expect(formatDuration(Number.MAX_SAFE_INTEGER)).toMatch(/^\d+h(\d+m)?(\d+s)?$/);
  });
});

describe('formatDuration — round-trip with parseDuration (the contract)', () => {
  it('reproduces every whole-second duration exactly', () => {
    for (const ms of [0, 1_000, 59_000, 60_000, 3_600_000, 5_400_000, 86_399_000]) {
      expect(parseDuration(formatDuration(ms))).toBe(ms);
    }
  });

  it('truncates to the second for sub-second remainders', () => {
    expect(parseDuration(formatDuration(5_400_999))).toBe(5_400_000);
  });

  it('produces output parseDuration accepts, for every unit combination', () => {
    const hour = 3_600_000;
    const minute = 60_000;
    const second = 1_000;
    for (const ms of [
      hour,
      minute,
      second,
      hour + minute,
      hour + second,
      minute + second,
      hour + minute + second,
    ]) {
      expect(parseDuration(formatDuration(ms))).toBe(ms);
    }
  });
});

describe('formatDuration — rejected input (ADR-0004 split)', () => {
  it('throws TypeError on a non-number', () => {
    expect(() => formatDuration(/** @type {any} */ ('1000'))).toThrow(TypeError);
    expect(() => formatDuration(/** @type {any} */ (null))).toThrow(TypeError);
    expect(() => formatDuration(/** @type {any} */ (1000n))).toThrow(TypeError);
  });

  it('throws TypeError on values the grammar cannot express', () => {
    expect(() => formatDuration(-1)).toThrow(TypeError);
    expect(() => formatDuration(Number.NaN)).toThrow(TypeError);
    expect(() => formatDuration(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => formatDuration(Number.MAX_SAFE_INTEGER + 2)).toThrow(TypeError);
  });
});
