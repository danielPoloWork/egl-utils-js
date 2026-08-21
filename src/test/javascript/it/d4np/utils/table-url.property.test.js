import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  tableStateFromParams,
  tableStateToParams,
} from '../../../../../main/javascript/it/d4np/utils/table.js';

// Property suite (roadmap 19.2, spec 06 §2 item F92, §6) for the one law this
// pair has to obey: `parse(serialize(s))` is `s`, for every state a pipeline can
// hold. Examples would only find the encodings someone thought of — and the two
// characters that break a naive encoding, `:` in a sort key and `&` in a filter
// value, are exactly the ones nobody thinks of.

/**
 * Keys and values drawn to be hostile on purpose: the separator characters of
 * the encoding itself (`:` `&` `=` `?` `#` `.` `%` `+`), the prefix marker, and
 * arbitrary unicode. A key generator that produced only identifiers would prove
 * nothing about a scheme whose whole risk is delimiter collision.
 */
const hostile = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.string({ unit: 'grapheme', maxLength: 12 }),
  fc.constantFrom(
    ':',
    '::',
    'a:b',
    'a:asc',
    'a:desc',
    '&',
    'a&b=c',
    '=',
    '?',
    '#',
    '.',
    'filter.',
    'filter.x',
    'q',
    'sort',
    'page',
    'size',
    '%20',
    '%',
    '+',
    ' ',
    'é',
    '日本',
  ),
);

/** Non-empty, because an empty key or value is not a state a pipeline holds. */
const key = hostile.filter((s) => s !== '');
const value = hostile.filter((s) => s !== '');

const state = fc.record({
  // `dictionary` guarantees distinct keys, which is what a filter map is.
  filters: fc.dictionary(key, value, { maxKeys: 4 }),
  search: fc.oneof(fc.constant(''), value),
  sort: fc.array(fc.record({ key, direction: fc.constantFrom('asc', 'desc') }), { maxLength: 4 }),
  page: fc.integer({ min: 1, max: 5000 }),
  pageSize: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 500 })),
});

const prefix = fc.oneof(fc.constant(''), fc.constantFrom('t', 'orders', 'a.b', 'q', 'filter'));

describe('the F92 round-trip law', () => {
  it('parse(serialize(state)) === state, for every state and every prefix', () => {
    fc.assert(
      fc.property(state, prefix, (original, ns) => {
        const options = ns === '' ? {} : { prefix: ns };
        const restored = tableStateFromParams(tableStateToParams(original, options), options);
        expect(restored).toEqual(original);
      }),
      { numRuns: 600 },
    );
  });

  it('holds when the URL also carries parameters belonging to someone else', () => {
    fc.assert(
      fc.property(state, fc.dictionary(key, value, { maxKeys: 3 }), (original, foreign) => {
        // Foreign parameters that would collide with our own names are excluded
        // by construction here: an unprefixed scheme cannot tell `page=2` typed by
        // this library from `page=2` typed by the page around it, which is what
        // the `prefix` option exists to resolve and what its own test covers.
        const base = new URLSearchParams();
        for (const [k, v] of Object.entries(foreign)) base.append(`x.${k}`, v);
        const carried = base.toString();

        const serialized = tableStateToParams(original, { base: carried });
        expect(tableStateFromParams(serialized)).toEqual(original);

        // And every foreign parameter survived, value for value.
        const after = new URLSearchParams(serialized);
        for (const [k, v] of Object.entries(foreign)) expect(after.get(`x.${k}`)).toBe(v);
      }),
      { numRuns: 300 },
    );
  });

  it('two bindings on one URL never read each other', () => {
    fc.assert(
      fc.property(state, state, (left, right) => {
        const both = tableStateToParams(right, {
          prefix: 'right',
          base: tableStateToParams(left, { prefix: 'left' }),
        });
        expect(tableStateFromParams(both, { prefix: 'left' })).toEqual(left);
        expect(tableStateFromParams(both, { prefix: 'right' })).toEqual(right);
      }),
      { numRuns: 300 },
    );
  });

  it('serialization is stable — equal states serialize byte-identically', () => {
    fc.assert(
      fc.property(state, (original) => {
        // Re-keyed through a shuffle of insertion order: the history binding
        // compares serializations to decide whether to push an entry, so an
        // encoding that depended on key order would push on every change.
        // Rebuilt through `fromEntries`, not by assignment — the same reason the
        // implementation does (BUG-0004): assigning a key called `__proto__` sets
        // a prototype instead of a property, and this suite generates that key.
        const shuffled = {
          ...original,
          filters: Object.fromEntries(
            Object.keys(original.filters)
              .reverse()
              .map((k) => [k, original.filters[k]]),
          ),
        };
        expect(tableStateToParams(shuffled)).toBe(tableStateToParams(original));
      }),
      { numRuns: 300 },
    );
  });

  it('never throws on arbitrary query strings — the URL is untrusted input', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 120 }), (raw) => {
        const parsed = tableStateFromParams(raw);
        expect(Number.isInteger(parsed.page) && parsed.page >= 1).toBe(true);
        expect(parsed.pageSize === null || parsed.pageSize >= 1).toBe(true);
        expect(typeof parsed.search).toBe('string');
        for (const entry of parsed.sort) {
          expect(entry.key).not.toBe('');
          expect(['asc', 'desc']).toContain(entry.direction);
        }
        // Whatever came out is itself serializable: the two directions compose.
        expect(() => tableStateToParams(parsed)).not.toThrow();
      }),
      { numRuns: 600 },
    );
  });
});
