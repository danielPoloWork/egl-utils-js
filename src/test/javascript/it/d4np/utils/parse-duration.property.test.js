import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseDuration } from '../../../../../main/javascript/it/d4np/utils/diagnostics.js';
import { DurationParseError } from '../../../../../main/javascript/it/d4np/utils/errors.js';

// Property suite (roadmap 2.6 template, spec §7) for the parseDuration
// grammar (spec §2 item 25).

const UNIT_MS = { h: 3_600_000, m: 60_000, s: 1_000 };

describe('parseDuration — grammar round-trip law', () => {
  // Build a canonical duration: a non-empty, descending-order subset of
  // [h, m, s], each with a non-negative integer chosen so the total stays a
  // safe integer. Rendering then parsing must recover the computed ms.
  const canonicalDuration = fc
    .record({
      h: fc.option(fc.nat({ max: 1000 }), { nil: undefined }),
      m: fc.option(fc.nat({ max: 100_000 }), { nil: undefined }),
      s: fc.option(fc.nat({ max: 1_000_000 }), { nil: undefined }),
    })
    .filter((parts) => parts.h !== undefined || parts.m !== undefined || parts.s !== undefined)
    .map((parts) => {
      let str = '';
      let ms = 0;
      for (const unit of /** @type {const} */ (['h', 'm', 's'])) {
        const value = parts[unit];
        if (value !== undefined) {
          str += `${value}${unit}`;
          ms += value * UNIT_MS[unit];
        }
      }
      return { str, ms };
    });

  it('recovers the exact millisecond total for any canonical duration', () => {
    fc.assert(
      fc.property(canonicalDuration, ({ str, ms }) => {
        expect(parseDuration(str)).toBe(ms);
      }),
      { numRuns: 300 },
    );
  });

  it('tolerates surrounding whitespace without changing the result', () => {
    fc.assert(
      fc.property(canonicalDuration, fc.stringMatching(/^[ \t]*$/), ({ str, ms }, pad) => {
        expect(parseDuration(`${pad}${str}${pad}`)).toBe(ms);
      }),
      { numRuns: 100 },
    );
  });
});

describe('parseDuration — totality law (never NaN)', () => {
  // Invariant: for ANY string, parseDuration either returns a safe
  // non-negative integer or throws DurationParseError — never NaN, never a
  // different error type. This is spec F25's core promise over arbitrary
  // (including adversarial) input.
  it('either returns a safe non-negative integer or throws DurationParseError', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        let value;
        try {
          value = parseDuration(s);
        } catch (error) {
          expect(error).toBeInstanceOf(DurationParseError);
          return;
        }
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 250 },
    );
  });

  // A stronger unit-alphabet stress: strings drawn only from digits and the
  // valid unit letters still obey the law, exercising the ordering/repetition
  // rejection paths far more densely than fc.string() would.
  it('holds over the digit-and-unit alphabet', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'0123456789hms'.split('')), maxLength: 12 }),
        (s) => {
          let value;
          try {
            value = parseDuration(s);
          } catch (error) {
            expect(error).toBeInstanceOf(DurationParseError);
            return;
          }
          expect(Number.isSafeInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 250 },
    );
  });
});
