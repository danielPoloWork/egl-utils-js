import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  truncate,
  wrapText,
  fixedWidth,
} from '../../../../../main/javascript/it/d4np/utils/text.js';

// Property suite (roadmap 2.6 template) for the text module: the length and
// totality laws spec 02 §6 requires of F26-F28.

/** Any code unit sequence, lone surrogates included — the adversarial input. */
const anyString = fc.string({ unit: 'binary', maxLength: 120 });
/** Strings that mix words, whitespace, and astral code points. */
const anyText = fc.oneof(anyString, fc.string({ unit: 'grapheme', maxLength: 120 }));

/** @param {string} value @returns {boolean} */
function hasLoneSurrogate(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('truncate — length laws (spec 02 F26)', () => {
  // Invariant: the result never exceeds the budget, whatever the marker or side.
  it('never exceeds maxLength for any input, marker, or side', () => {
    fc.assert(
      fc.property(
        anyText,
        fc.nat({ max: 40 }),
        fc.string({ maxLength: 5 }),
        fc.constantFrom(/** @type {const} */ ('end'), /** @type {const} */ ('start')),
        (str, maxLength, ellipsis, position) => {
          expect(truncate(str, maxLength, { ellipsis, position }).length).toBeLessThanOrEqual(
            maxLength,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  // Invariant: shortening happens only when it must; a fitting string is identity.
  it('returns the input unchanged exactly when it fits', () => {
    fc.assert(
      fc.property(anyText, fc.nat({ max: 40 }), (str, maxLength) => {
        if (str.length <= maxLength) {
          expect(truncate(str, maxLength)).toBe(str);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Invariant: truncate is idempotent — the marker is never re-applied.
  it('is idempotent', () => {
    fc.assert(
      fc.property(anyText, fc.nat({ max: 40 }), (str, maxLength) => {
        const once = truncate(str, maxLength);
        expect(truncate(once, maxLength)).toBe(once);
      }),
      { numRuns: 200 },
    );
  });

  // Invariant: a cut never leaves half of a surrogate pair behind — unless the
  // input itself was already malformed.
  it('introduces no lone surrogate that the input did not already have', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 60 }),
        fc.nat({ max: 30 }),
        (str, maxLength) => {
          expect(hasLoneSurrogate(truncate(str, maxLength, { ellipsis: '' }))).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('wrapText — line laws (spec 02 F27)', () => {
  // Invariant: with breakLongWords, every produced line respects the width.
  it('never emits a line longer than width when long words may break', () => {
    fc.assert(
      fc.property(anyText, fc.integer({ min: 1, max: 20 }), (str, width) => {
        for (const line of wrapText(str, width, { breakLongWords: true }).split('\n')) {
          expect(line.length).toBeLessThanOrEqual(width + 1); // +1: a lone astral code point
        }
      }),
      { numRuns: 300 },
    );
  });

  // Invariant: without breaking, only single unbreakable words may overflow.
  it('overflows only on words that cannot fit', () => {
    fc.assert(
      fc.property(anyText, fc.integer({ min: 1, max: 20 }), (str, width) => {
        for (const line of wrapText(str, width).split('\n')) {
          if (line.length > width) expect(line.includes(' ')).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  // Invariant: wrapping is stable — re-wrapping at the same width changes nothing.
  it('is idempotent at the same width', () => {
    fc.assert(
      fc.property(anyText, fc.integer({ min: 2, max: 20 }), (str, width) => {
        const once = wrapText(str, width, { breakLongWords: true });
        expect(wrapText(once, width, { breakLongWords: true })).toBe(once);
      }),
      { numRuns: 200 },
    );
  });

  // Invariant: no word content is lost or invented — only separators change.
  it('preserves the sequence of non-whitespace characters', () => {
    // The same separator class wrapText collapses — not \s, which also covers
    // NBSP and the Unicode spaces the wrapper deliberately treats as content.
    const strip = (/** @type {string} */ value) => value.replace(/[\t\n\v\f\r ]+/gu, '');
    fc.assert(
      fc.property(anyText, fc.integer({ min: 1, max: 20 }), (str, width) => {
        expect(strip(wrapText(str, width, { breakLongWords: true }))).toBe(strip(str));
      }),
      { numRuns: 300 },
    );
  });
});

describe('fixedWidth — exact-width law (spec 02 F28)', () => {
  // Invariant: the whole point of the function — every string, any options,
  // exactly `width` code units out.
  it('returns exactly width code units for any input and option combination', () => {
    fc.assert(
      fc.property(
        anyText,
        fc.nat({ max: 40 }),
        fc.constantFrom(
          /** @type {const} */ ('left'),
          /** @type {const} */ ('right'),
          /** @type {const} */ ('center'),
        ),
        fc.constantFrom(/** @type {const} */ ('end'), /** @type {const} */ ('start')),
        fc.string({ minLength: 1, maxLength: 3 }),
        (str, width, align, side, pad) => {
          expect(fixedWidth(str, width, { align, truncate: side, pad })).toHaveLength(width);
        },
      ),
      { numRuns: 400 },
    );
  });

  // Invariant: a string that already measures exactly is left alone.
  it('is the identity on strings of exactly width', () => {
    fc.assert(
      fc.property(anyText, (str) => {
        expect(fixedWidth(str, str.length)).toBe(str);
      }),
      { numRuns: 200 },
    );
  });

  // Invariant: applying it twice is the same as applying it once.
  it('is idempotent', () => {
    fc.assert(
      fc.property(anyText, fc.nat({ max: 30 }), (str, width) => {
        const once = fixedWidth(str, width);
        expect(fixedWidth(once, width)).toBe(once);
      }),
      { numRuns: 200 },
    );
  });
});
