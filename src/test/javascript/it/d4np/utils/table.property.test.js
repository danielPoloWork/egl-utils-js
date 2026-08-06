import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  compileFilter,
  comparator,
  paginate,
} from '../../../../../main/javascript/it/d4np/utils/table.js';

// Property suite (roadmap 2.6 template) for the table module: the totality law
// of the filter grammar (NFR-09), the total-order laws of the comparator, and
// the partition law of paginate — spec 02 §6.

/** Arbitrary expressions, including hostile and half-typed ones. */
const anyExpression = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 60 }),
  fc.string({ unit: 'grapheme', maxLength: 60 }),
  // Biased toward operator-shaped input, so the grammar's edges get hit.
  fc
    .tuple(
      fc.constantFrom('', '>', '<', '>=', '<=', '=', '!=', '!', '^', '~'),
      fc.constantFrom('', ' ', 'abc', '42', '1.5', 'null', 'empty', 'blank', 'NULL', '-'),
      fc.constantFrom('', '$'),
    )
    .map((parts) => parts.join('')),
);

/** Arbitrary cell values, including ones that resist conversion. */
const anyValue = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constantFrom(null, undefined, ''),
  fc.date({ noInvalidDate: false }),
  fc.constant(Object.create(null)),
  fc.constant(Symbol('s')),
  fc.bigInt(),
);

describe('compileFilter — totality (spec 02 NFR-09)', () => {
  // Invariant: every string compiles. A filter box types through invalid
  // states on the way to valid ones; none of them may throw.
  it('compiles any string to a predicate', () => {
    fc.assert(
      fc.property(anyExpression, (expression) => {
        expect(typeof compileFilter(expression)).toBe('function');
      }),
    );
  });

  // Invariant: the predicate is total too — any value, always a boolean.
  it('returns a boolean for any value, never throwing', () => {
    fc.assert(
      fc.property(anyExpression, anyValue, (expression, value) => {
        expect(typeof compileFilter(expression)(value)).toBe('boolean');
      }),
    );
  });

  // Invariant: compiling is stateless — the same expression always behaves the
  // same way, and one predicate can be reused across rows.
  it('is deterministic and reusable', () => {
    fc.assert(
      fc.property(anyExpression, fc.array(anyValue, { maxLength: 8 }), (expression, values) => {
        const once = compileFilter(expression);
        const twice = compileFilter(expression);
        for (const value of values) {
          expect(once(value)).toBe(twice(value));
          expect(once(value)).toBe(once(value));
        }
      }),
    );
  });

  // Invariant: an empty filter is not a filter.
  it('matches everything for a blank expression', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[ \t\n]*$/), anyValue, (expression, value) => {
        expect(compileFilter(expression)(value)).toBe(true);
      }),
    );
  });

  // Invariant: the sentinels nest — null ⊂ empty ⊂ blank — and each negation is
  // the exact complement of its positive form.
  it('nests the sentinels and negates them exactly', () => {
    const isNull = compileFilter('=null');
    const isEmpty = compileFilter('=empty');
    const isBlank = compileFilter('=blank');
    fc.assert(
      fc.property(anyValue, (value) => {
        if (isNull(value)) expect(isEmpty(value)).toBe(true);
        if (isEmpty(value)) expect(isBlank(value)).toBe(true);
        expect(compileFilter('!null')(value)).toBe(!isNull(value));
        expect(compileFilter('!empty')(value)).toBe(!isEmpty(value));
        expect(compileFilter('!blank')(value)).toBe(!isBlank(value));
      }),
    );
  });

  // Invariant: `=x` and `!=x` partition every value between them.
  it('makes equality and inequality exact complements', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), anyValue, (operand, value) => {
        const trimmed = operand.trim();
        if (trimmed === '' || ['null', 'empty', 'blank'].includes(trimmed.toLowerCase())) return;
        expect(compileFilter(`=${trimmed}`)(value)).toBe(!compileFilter(`!=${trimmed}`)(value));
      }),
    );
  });
});

describe('comparator — total-order laws (spec 02 F34)', () => {
  /** The mixed-type population that makes the laws worth asserting. */
  const orderable = fc.oneof(
    fc.string({ maxLength: 8 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
    fc.constantFrom(null, undefined, '', '2026-01-15', '2026-06-30'),
  );

  const modes = fc.record({
    type: fc.constantFrom(
      /** @type {const} */ ('auto'),
      /** @type {const} */ ('string'),
      /** @type {const} */ ('number'),
      /** @type {const} */ ('date'),
      /** @type {const} */ ('boolean'),
    ),
    direction: fc.constantFrom(/** @type {const} */ ('asc'), /** @type {const} */ ('desc')),
    emptiesLast: fc.boolean(),
  });

  it('is reflexive: a value compares equal to itself', () => {
    fc.assert(
      fc.property(orderable, modes, (value, options) => {
        expect(comparator({ ...options, locale: 'en' })(value, value)).toBe(0);
      }),
    );
  });

  it('is antisymmetric: swapping the arguments flips the sign', () => {
    // `Math.sign` preserves the sign of zero, so both `-Math.sign(0)` and
    // `Math.sign(-0)` are `-0` and would fail an `Object.is` comparison against
    // `+0`. Collapse to a three-valued sign instead.
    const sgn = (/** @type {number} */ n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
    fc.assert(
      fc.property(orderable, orderable, modes, (a, b, options) => {
        const compare = comparator({ ...options, locale: 'en' });
        expect(sgn(compare(a, b))).toBe(sgn(-compare(b, a)));
      }),
    );
  });

  it('is transitive: a <= b and b <= c imply a <= c', () => {
    fc.assert(
      fc.property(orderable, orderable, orderable, modes, (a, b, c, options) => {
        const compare = comparator({ ...options, locale: 'en' });
        if (compare(a, b) <= 0 && compare(b, c) <= 0) {
          expect(compare(a, c)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });

  // Invariant: reversing a column must not scatter its blanks through the
  // middle — this is what "pinned" means. `undefined` is excluded on purpose:
  // `Array.prototype.sort` relocates it to the end itself, without consulting
  // any comparator, so no implementation could satisfy this law for it (the
  // example suite pins that language behaviour down explicitly).
  it('keeps missing values on the same side in both directions', () => {
    const sortable = fc.oneof(
      fc.string({ maxLength: 8 }),
      fc.integer({ min: -1000, max: 1000 }),
      fc.boolean(),
      fc.constantFrom(null, '', '2026-01-15'),
    );
    fc.assert(
      fc.property(fc.array(sortable, { maxLength: 12 }), fc.boolean(), (rows, emptiesLast) => {
        {
          const missing = (/** @type {unknown} */ value) =>
            value === null || value === undefined || value === '';
          for (const direction of /** @type {const} */ (['asc', 'desc'])) {
            const sorted = [...rows].sort(comparator({ direction, emptiesLast, locale: 'en' }));
            const flags = sorted.map(missing);
            // All missing values form one contiguous run, at the chosen end.
            const firstMissing = flags.indexOf(true);
            const lastPresent = flags.lastIndexOf(false);
            if (firstMissing === -1 || lastPresent === -1) continue;
            if (emptiesLast) expect(firstMissing).toBeGreaterThan(lastPresent);
            else expect(firstMissing).toBeLessThan(lastPresent);
          }
        }
      }),
    );
  });

  // Invariant: sorting is a permutation — nothing is dropped or invented.
  it('permutes the input without losing values', () => {
    fc.assert(
      fc.property(fc.array(orderable, { maxLength: 12 }), modes, (rows, options) => {
        const sorted = [...rows].sort(comparator({ ...options, locale: 'en' }));
        expect(sorted).toHaveLength(rows.length);
        expect([...sorted].sort()).toEqual([...rows].sort());
      }),
    );
  });
});

describe('paginate — partition laws (spec 02 F35)', () => {
  // Invariant: the pages of a list, concatenated in order, reconstruct it —
  // no row is dropped or duplicated by pagination.
  it('partitions the input exactly across its pages', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 40 }),
        fc.integer({ min: 1, max: 10 }),
        (rows, pageSize) => {
          const { pageCount } = paginate(rows, { pageSize });
          /** @type {number[]} */
          const rebuilt = [];
          for (let page = 1; page <= pageCount; page += 1) {
            rebuilt.push(...paginate(rows, { page, pageSize }).items);
          }
          expect(rebuilt).toEqual(rows);
        },
      ),
    );
  });

  // Invariant: every page is within size, and the reported page is in range.
  it('never exceeds pageSize and always clamps into range', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 40 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: -50, max: 50 }),
        (rows, pageSize, page) => {
          const result = paginate(rows, { page, pageSize });
          expect(result.items.length).toBeLessThanOrEqual(pageSize);
          expect(result.page).toBeGreaterThanOrEqual(1);
          expect(result.page).toBeLessThanOrEqual(result.pageCount);
          expect(result.pageCount).toBeGreaterThanOrEqual(1);
          expect(result.total).toBe(rows.length);
        },
      ),
    );
  });
});
