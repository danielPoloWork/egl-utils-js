import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  formatDuration,
  parseDuration,
  normalizeError,
} from '../../../../../main/javascript/it/d4np/utils/diagnostics.js';

// Property suite (roadmap 2.6 template) for the diagnostics additions: the
// round-trip law of F36 and the totality law of F37 — spec 02 §6.

describe('formatDuration — round-trip law (spec 02 F36)', () => {
  /** Whole seconds, the domain on which the inverse is exact. */
  const wholeSeconds = fc.integer({ min: 0, max: 9_000_000 }).map((s) => s * 1000);

  // Invariant: formatDuration is a genuine inverse of parseDuration, which is
  // what makes it safe to render a duration and read it back.
  it('parseDuration(formatDuration(ms)) === ms for every whole second', () => {
    fc.assert(
      fc.property(wholeSeconds, (ms) => {
        expect(parseDuration(formatDuration(ms))).toBe(ms);
      }),
    );
  });

  // Invariant: the output is always in the grammar — never empty, never
  // out of order, never a repeated unit (all three would make parseDuration throw).
  it('always produces a string parseDuration accepts', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 9e12, noNaN: true }), (ms) => {
        const formatted = formatDuration(ms);
        expect(formatted).not.toBe('');
        expect(() => parseDuration(formatted)).not.toThrow();
      }),
    );
  });

  // Invariant: truncation, never rounding — the reported duration never claims
  // more time than actually elapsed.
  it('never reports more than the elapsed time, and never less than a second short', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 9e12, noNaN: true }), (ms) => {
        const reported = parseDuration(formatDuration(ms));
        expect(reported).toBeLessThanOrEqual(Math.floor(ms));
        expect(reported).toBeGreaterThan(ms - 1000);
      }),
    );
  });

  // Invariant: monotonic — a longer duration never formats to a shorter one.
  it('is monotonic in the duration', () => {
    fc.assert(
      fc.property(wholeSeconds, wholeSeconds, (a, b) => {
        if (a > b) {
          expect(parseDuration(formatDuration(a))).toBeGreaterThanOrEqual(
            parseDuration(formatDuration(b)),
          );
        }
      }),
    );
  });
});

describe('normalizeError — totality (spec 02 F37)', () => {
  /** Anything a catch block can receive, including values that resist reading. */
  const anyThrown = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.double(),
    fc.boolean(),
    fc.constantFrom(null, undefined),
    fc.bigInt(),
    fc.constant(Symbol('thrown')),
    fc.object(),
    fc.array(fc.integer()),
    fc.date({ noInvalidDate: false }),
    fc.string().map((message) => new Error(message)),
    fc.string().map((message) => new TypeError(message)),
    fc.record({
      status: fc.integer(),
      body: fc.oneof(fc.string(), fc.object()),
    }),
    fc.constant(Object.create(null)),
    fc.constant({
      get message() {
        throw new Error('hostile getter');
      },
    }),
  );

  // Invariant: the normalizer is the last line of a catch block; it may never
  // be the thing that throws.
  it('never throws, whatever it is handed', () => {
    fc.assert(
      fc.property(anyThrown, (value) => {
        expect(() => normalizeError(value)).not.toThrow();
      }),
    );
  });

  // Invariant: the record's shape is guaranteed, so a logger can rely on it.
  it('always returns a record with string name and message', () => {
    fc.assert(
      fc.property(anyThrown, (value) => {
        const record = normalizeError(value);
        expect(typeof record.name).toBe('string');
        expect(record.name).not.toBe('');
        expect(typeof record.message).toBe('string');
      }),
    );
  });

  // Invariant: non-destructive — the original is carried through by identity,
  // so `log(normalizeError(e)); throw e;` loses nothing.
  it('returns the original value as cause, by identity', () => {
    fc.assert(
      fc.property(anyThrown, (value) => {
        const record = normalizeError(value);
        if (typeof value === 'number' && Number.isNaN(value)) {
          expect(Number.isNaN(record.cause)).toBe(true);
          return;
        }
        expect(record.cause).toBe(value);
      }),
    );
  });

  // Invariant: optional fields are absent rather than undefined, so a record
  // serializes cleanly and `'status' in record` means what it says.
  it('omits optional fields instead of setting them undefined', () => {
    fc.assert(
      fc.property(anyThrown, (value) => {
        const record = normalizeError(value);
        for (const key of ['stack', 'code', 'status', 'detail']) {
          if (key in record) {
            expect(/** @type {Record<string, unknown>} */ (record)[key]).not.toBeUndefined();
          }
        }
      }),
    );
  });

  // Invariant: deterministic — the same value always normalizes the same way.
  it('is deterministic', () => {
    fc.assert(
      fc.property(anyThrown, (value) => {
        expect(normalizeError(value)).toEqual(normalizeError(value));
      }),
    );
  });
});
