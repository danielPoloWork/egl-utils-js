import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  isIpv4,
  parseIpv4,
  formatIpv4,
  ipv4ToKey,
  ipv4FromKey,
  subnetMaskFromPrefix,
} from '../../../../../main/javascript/it/d4np/utils/net.js';

// Property suite (roadmap 2.6 template) for the net module: the round-trip,
// ordering, and totality laws spec 02 §6 requires of F29-F32.

/** One octet. */
const octet = fc.nat({ max: 255 });
/** A canonical dotted-quad address, the domain both parsers agree on. */
const canonicalIpv4 = fc.tuple(octet, octet, octet, octet).map((parts) => parts.join('.'));
/** Anything at all, to prove the parsers are total over strings. */
const anyString = fc.string({ unit: 'binary', maxLength: 40 });
/** Strings biased toward address-like shapes, so the adversarial cases get hit. */
const addressLike = fc.oneof(
  canonicalIpv4,
  anyString,
  fc
    .array(fc.oneof(fc.integer({ min: -5, max: 300 }), fc.constantFrom('', '00', '0x1', ' 1')), {
      minLength: 1,
      maxLength: 6,
    })
    .map((parts) => parts.join('.')),
);

describe('parseIpv4 / formatIpv4 — round-trip laws (spec 02 F30)', () => {
  // Invariant: formatting a parsed address reproduces the input exactly.
  it('formatIpv4(parseIpv4(v)) === v for every canonical address', () => {
    fc.assert(
      fc.property(canonicalIpv4, (address) => {
        const octets = parseIpv4(address);
        expect(octets).not.toBeNull();
        expect(formatIpv4(/** @type {number[]} */ (octets))).toBe(address);
      }),
    );
  });

  // Invariant: the other direction closes too — rendered octets re-parse equal.
  it('parseIpv4(formatIpv4(o)) equals o for every valid octet tuple', () => {
    fc.assert(
      fc.property(fc.tuple(octet, octet, octet, octet), (octets) => {
        const address = formatIpv4(octets);
        expect(address).not.toBeNull();
        expect(parseIpv4(/** @type {string} */ (address))).toEqual([...octets]);
      }),
    );
  });

  // Invariant: the predicate and the parser can never disagree.
  it('isIpv4 agrees with parseIpv4 on any string', () => {
    fc.assert(
      fc.property(addressLike, (value) => {
        expect(isIpv4(value)).toBe(parseIpv4(value) !== null);
      }),
    );
  });
});

describe('net — totality over strings (ADR-0004 split)', () => {
  // Invariant: invalid content is a null, never an exception.
  it('never throws for any string input', () => {
    fc.assert(
      fc.property(addressLike, (value) => {
        expect(() => isIpv4(value)).not.toThrow();
        expect(() => parseIpv4(value)).not.toThrow();
        expect(() => ipv4ToKey(value)).not.toThrow();
        expect(() => ipv4FromKey(value)).not.toThrow();
        expect(() => subnetMaskFromPrefix(value)).not.toThrow();
      }),
    );
  });

  // Invariant: a rejected address is rejected at every octet width.
  it('returns null from ipv4ToKey whenever the input is not that many octets', () => {
    fc.assert(
      fc.property(addressLike, fc.integer({ min: 1, max: 4 }), (value, octets) => {
        const key = ipv4ToKey(value, { octets });
        if (key === null) return;
        expect(key).toHaveLength(octets * 3);
        expect(/^[0-9]+$/.test(key)).toBe(true);
      }),
    );
  });
});

describe('ipv4ToKey / ipv4FromKey — codec laws (spec 02 F31)', () => {
  // Invariant: the codec is lossless in both directions, at any prefix width.
  it('ipv4FromKey(ipv4ToKey(v)) === v for every canonical address', () => {
    fc.assert(
      fc.property(canonicalIpv4, (address) => {
        const key = ipv4ToKey(address);
        expect(key).not.toBeNull();
        expect(ipv4FromKey(/** @type {string} */ (key))).toBe(address);
      }),
    );
  });

  it('round-trips prefixes of one to four octets', () => {
    fc.assert(
      fc.property(
        fc.array(octet, { minLength: 1, maxLength: 4 }),
        /** @param {number[]} parts */
        (parts) => {
          const dotted = parts.join('.');
          const key = ipv4ToKey(dotted, { octets: parts.length });
          expect(key).not.toBeNull();
          expect(ipv4FromKey(/** @type {string} */ (key))).toBe(dotted);
        },
      ),
    );
  });

  // Invariant: THE reason the codec exists — string order becomes address order.
  it('orders keys lexicographically exactly as addresses order numerically', () => {
    fc.assert(
      fc.property(canonicalIpv4, canonicalIpv4, (left, right) => {
        const leftOctets = /** @type {number[]} */ (parseIpv4(left));
        const rightOctets = /** @type {number[]} */ (parseIpv4(right));
        let numeric = 0;
        for (let i = 0; i < 4 && numeric === 0; i += 1) {
          numeric = Math.sign(leftOctets[i] - rightOctets[i]);
        }
        const leftKey = /** @type {string} */ (ipv4ToKey(left));
        const rightKey = /** @type {string} */ (ipv4ToKey(right));
        const lexicographic = leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        expect(lexicographic).toBe(numeric);
      }),
    );
  });

  // Invariant: an octet-aligned network test reduces to startsWith.
  it('makes every prefix key a literal prefix of the full key', () => {
    fc.assert(
      fc.property(canonicalIpv4, fc.integer({ min: 1, max: 4 }), (address, octets) => {
        const full = /** @type {string} */ (ipv4ToKey(address));
        const prefixDotted = address.split('.').slice(0, octets).join('.');
        const prefixKey = /** @type {string} */ (ipv4ToKey(prefixDotted, { octets }));
        expect(full.startsWith(prefixKey)).toBe(true);
        expect(prefixKey).toBe(full.slice(0, octets * 3));
      }),
    );
  });
});

describe('subnetMaskFromPrefix — mask laws (spec 02 F32)', () => {
  // Invariant: a mask is a run of ones followed by a run of zeros, and its
  // population count is the prefix length.
  it('produces a contiguous mask whose bit count is the prefix', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 32 }), (prefix) => {
        const mask = /** @type {string} */ (subnetMaskFromPrefix(prefix));
        expect(isIpv4(mask)).toBe(true);
        const bits = /** @type {number[]} */ (parseIpv4(mask))
          .map((part) => part.toString(2).padStart(8, '0'))
          .join('');
        expect(bits).toBe('1'.repeat(prefix) + '0'.repeat(32 - prefix));
      }),
    );
  });

  // Invariant: the three accepted shapes are interchangeable.
  it('treats /n, n, and the number n as the same prefix', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 32 }), (prefix) => {
        const fromNumber = subnetMaskFromPrefix(prefix);
        expect(subnetMaskFromPrefix(`${prefix}`)).toBe(fromNumber);
        expect(subnetMaskFromPrefix(`/${prefix}`)).toBe(fromNumber);
      }),
    );
  });

  // Invariant: nothing outside 0-32 ever yields a mask.
  it('returns null for every out-of-range prefix', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ min: 33, max: 500 }), fc.integer({ min: -500, max: -1 })),
        (prefix) => {
          expect(subnetMaskFromPrefix(prefix)).toBeNull();
          expect(subnetMaskFromPrefix(`${prefix}`)).toBeNull();
        },
      ),
    );
  });
});
