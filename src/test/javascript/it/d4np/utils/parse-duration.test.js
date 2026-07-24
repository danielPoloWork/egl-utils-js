import { describe, it, expect } from 'vitest';
import { parseDuration } from '../../../../../main/javascript/it/d4np/utils/diagnostics.js';
import { DurationParseError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

// Example tests (roadmap 5.6, spec §2 item 25, ADR-0009) for parseDuration.

describe('parseDuration — spec examples', () => {
  it('parses single-unit durations', () => {
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('30m')).toBe(1_800_000);
    expect(parseDuration('5s')).toBe(5_000);
  });

  it('parses the composed example 1h30m', () => {
    expect(parseDuration('1h30m')).toBe(5_400_000);
  });

  it('parses all three units composed', () => {
    expect(parseDuration('1h30m45s')).toBe(3_600_000 + 1_800_000 + 45_000);
  });
});

describe('parseDuration — accepted forms', () => {
  it('accepts zero', () => {
    expect(parseDuration('0s')).toBe(0);
    expect(parseDuration('0h')).toBe(0);
  });

  it('accepts a value larger than the next unit would roll over (90m stays 90m)', () => {
    expect(parseDuration('90m')).toBe(5_400_000);
  });

  it('accepts multi-digit values', () => {
    expect(parseDuration('123s')).toBe(123_000);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDuration('  1h30m  ')).toBe(5_400_000);
  });

  it('accepts a large but safe total', () => {
    expect(parseDuration('1000000h')).toBe(1_000_000 * 3_600_000);
  });
});

describe('parseDuration — rejected forms (never NaN)', () => {
  /** @param {string} bad */
  const rejects = (bad) => {
    expect(() => parseDuration(bad)).toThrow(DurationParseError);
    // The defining guarantee: never a NaN return, always a throw.
    let returned;
    try {
      returned = parseDuration(bad);
    } catch {
      returned = 'threw';
    }
    expect(returned).toBe('threw');
  };

  it('rejects the empty string and whitespace-only', () => {
    rejects('');
    rejects('   ');
  });

  it('rejects a bare number with no unit', () => {
    rejects('100');
  });

  it('rejects an unknown unit', () => {
    rejects('5d');
    rejects('10ms');
    rejects('1y');
    rejects('3w');
  });

  it('rejects out-of-order units', () => {
    rejects('30m1h');
    rejects('5s1h');
    rejects('45s30m');
  });

  it('rejects a repeated unit', () => {
    rejects('1h1h');
    rejects('30m30m');
  });

  it('rejects uppercase units (m is minutes, not months — case is significant)', () => {
    rejects('1H');
    rejects('30M');
    rejects('5S');
  });

  it('rejects internal whitespace', () => {
    rejects('1h 30m');
  });

  it('rejects signs and decimals', () => {
    rejects('-5s');
    rejects('+5s');
    rejects('1.5h');
  });

  it('rejects a unit with no leading number', () => {
    rejects('h');
    rejects('hms');
  });

  it('rejects a total beyond the safe integer range (never Infinity, never lossy)', () => {
    rejects('9999999999999h'); // ~3.6e19 ms, far past Number.MAX_SAFE_INTEGER
  });

  it('rejects stray trailing characters', () => {
    rejects('5sx');
    rejects('5s5');
  });
});

describe('parseDuration — error detail', () => {
  it('carries the offending input on cause', () => {
    try {
      parseDuration('30m1h');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DurationParseError);
      expect(/** @type {DurationParseError} */ (error).code).toBe('EGL_DURATION_PARSE');
      expect(/** @type {any} */ (error).cause.input).toBe('30m1h');
    }
  });

  it('reports the position of an unknown unit', () => {
    try {
      parseDuration('1h5d');
      expect.unreachable();
    } catch (error) {
      expect(/** @type {any} */ (error).cause.position).toBe(3);
    }
  });
});

describe('parseDuration — non-string input throws TypeError', () => {
  it('throws TypeError (a programmer error, not a parse failure)', () => {
    for (const bad of [42, null, undefined, {}, ['1h'], 5_000n]) {
      expect(() => parseDuration(/** @type {any} */ (bad))).toThrow(TypeError);
      expect(() => parseDuration(/** @type {any} */ (bad))).not.toThrow(DurationParseError);
    }
  });
});
