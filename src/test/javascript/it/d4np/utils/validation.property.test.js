import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateEmail } from '../../../../../main/javascript/it/d4np/utils/validation.js';

// Property suite (roadmap 2.6 template) for the validation module.

/** Arbitrary for a single RFC 5322 atext character (our accepted alphabet). */
const atextChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ..."!#$%&'*+-/=?^_`{|}~",
);

/** Arbitrary for a local part: 1–4 atoms of 1–8 atext chars joined by dots (≤ 64 total by construction). */
const localPart = fc
  .array(fc.array(atextChar, { minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 4 })
  .map((atoms) => atoms.map((chars) => chars.join('')).join('.'));

const alnumChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
);

/** Arbitrary for a domain label: alnum with optional inner hyphens, 1–10 chars. */
const domainLabel = fc
  .tuple(alnumChar, fc.array(fc.oneof(alnumChar, fc.constant('-')), { maxLength: 8 }), alnumChar)
  .map(([first, middle, last]) => first + middle.join('') + last);

/** Arbitrary for a valid domain: 2–4 labels, final label ≥ 2 chars by construction. */
const domain = fc
  .array(domainLabel, { minLength: 2, maxLength: 4 })
  .map((labels) => labels.join('.'));

describe('validateEmail — acceptance and totality laws (spec §2 item 15)', () => {
  // Invariant: any address built from the accepted grammar is accepted.
  it('accepts every valid-by-construction address', () => {
    fc.assert(
      fc.property(localPart, domain, (local, dom) => {
        expect(validateEmail(`${local}@${dom}`)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  // Invariant: for ANY string, validateEmail returns a boolean and never
  // throws — total over strings, adversarial or not.
  it('is total over arbitrary strings (returns a boolean, never throws)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (input) => {
        expect(typeof validateEmail(input)).toBe('boolean');
      }),
      { numRuns: 200 },
    );
  });

  it('is total over arbitrary unicode strings too', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 400 }), (input) => {
        expect(typeof validateEmail(input)).toBe('boolean');
      }),
      { numRuns: 200 },
    );
  });

  // Invariant: whenever validateEmail says true, independently-checkable
  // structural facts hold (one @, caps respected, no forbidden edges).
  it('true implies the structural contract', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), localPart, domain, (noise, local, dom) => {
        // Mix generated-valid and arbitrary inputs so the implication is
        // exercised on both accepted and rejected values.
        for (const candidate of [noise, `${local}@${dom}`]) {
          if (validateEmail(candidate)) {
            const at = candidate.indexOf('@');
            expect(at).toBeGreaterThan(0);
            expect(candidate.indexOf('@', at + 1)).toBe(-1); // exactly one @
            expect(at).toBeLessThanOrEqual(64); // local cap
            expect(candidate.length - at - 1).toBeLessThanOrEqual(255); // domain cap
            expect(candidate).not.toMatch(/\.\./); // no empty atoms/labels anywhere
            expect(candidate.split('@')[1]).toContain('.'); // ≥ 2 labels
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
