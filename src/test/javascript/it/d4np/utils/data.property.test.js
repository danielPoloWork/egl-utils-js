import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  deepClone,
  deepMerge,
  pick,
  omit,
  groupBy,
  uniq,
  isObject,
  isEmpty,
} from '../../../../../main/javascript/it/d4np/utils/data.js';

// Property suite (roadmap 2.6 template) for the data module.

describe('deepClone — clone laws (spec §2 item 9)', () => {
  // Invariant: for any structured-cloneable value, the clone is deeply equal
  // to the input and, when the input is a non-null object, is a distinct
  // reference (a genuine copy, not the same object).
  it('produces a deeply-equal copy for any cloneable value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const clone = deepClone(value);
        expect(clone).toStrictEqual(value);
        if (value !== null && typeof value === 'object') {
          expect(clone).not.toBe(value);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Invariant: mutating the clone never affects the input — deepClone yields
  // an independent graph (no shared nested references).
  it('yields an independent graph: mutating the clone never touches the input', () => {
    fc.assert(
      fc.property(fc.object(), (value) => {
        const before = structuredClone(value); // reference snapshot of the input
        const clone = deepClone(value);
        // Mutate every own array/object reached from the clone.
        stampDeep(clone);
        expect(value).toStrictEqual(before); // input unchanged despite clone mutation
      }),
      { numRuns: 100 },
    );
  });
});

describe('deepMerge — merge laws (spec §2 item 10)', () => {
  // Invariant: deepMerge never mutates either input — after the merge, both
  // target and source are structurally identical to their pre-merge snapshots.
  it('mutates neither input for any pair of objects', () => {
    fc.assert(
      fc.property(fc.object(), fc.object(), (target, source) => {
        const targetSnapshot = structuredClone(target);
        const sourceSnapshot = structuredClone(source);
        deepMerge(target, source);
        expect(target).toStrictEqual(targetSnapshot);
        expect(source).toStrictEqual(sourceSnapshot);
      }),
      { numRuns: 100 },
    );
  });

  // Invariant: every key of both inputs appears in the result, and where the
  // source holds a non-object (a leaf) at a key it wins outright.
  it('is a superset of both key sets, with source leaves winning', () => {
    fc.assert(
      fc.property(fc.object(), fc.object(), (target, source) => {
        const result = deepMerge(target, source);
        for (const key of [...Object.keys(target), ...Object.keys(source)]) {
          expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(true);
        }
        for (const key of Object.keys(source)) {
          const sourceValue = /** @type {Record<string, unknown>} */ (source)[key];
          const isLeaf =
            sourceValue === null || typeof sourceValue !== 'object' || Array.isArray(sourceValue);
          if (isLeaf) {
            expect(/** @type {Record<string, unknown>} */ (result)[key]).toStrictEqual(sourceValue);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('pick / omit — partition laws (spec §2 item 11)', () => {
  // Invariant: for any object and any subset of its keys, pick(keys) and
  // omit(keys) partition the object's own enumerable keys — their key sets are
  // disjoint, and their union equals the original key set.
  it('pick and omit partition the input key set for any chosen keys', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string().filter((k) => k !== '__proto__'),
          fc.integer(),
        ),
        fc.array(fc.string()),
        (obj, chosen) => {
          const picked = pick(obj, /** @type {any} */ (chosen));
          const omitted = omit(obj, /** @type {any} */ (chosen));
          const pickedKeys = new Set(Object.keys(picked));
          const omittedKeys = new Set(Object.keys(omitted));

          // Disjoint.
          for (const key of pickedKeys) expect(omittedKeys.has(key)).toBe(false);
          // Union equals the original own-key set.
          const union = new Set([...pickedKeys, ...omittedKeys]);
          expect([...union].sort()).toEqual(Object.keys(obj).sort());
          // pick keeps exactly the chosen keys that exist.
          const chosenPresent = new Set(Object.keys(obj).filter((k) => chosen.includes(k)));
          expect([...pickedKeys].sort()).toEqual([...chosenPresent].sort());
        },
      ),
      { numRuns: 100 },
    );
  });

  // Invariant: merging the two halves back together reconstructs the original
  // object (values unchanged), confirming neither half drops or alters data.
  it('deepMerge(pick, omit) reconstructs the original object', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string().filter((k) => k !== '__proto__'),
          fc.integer(),
        ),
        fc.array(fc.string()),
        (obj, chosen) => {
          const picked = pick(obj, /** @type {any} */ (chosen));
          const omitted = omit(obj, /** @type {any} */ (chosen));
          expect(deepMerge(picked, omitted)).toEqual(obj);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('groupBy — partition laws (spec §2 item 12)', () => {
  // Invariant: for any array and any key function, groupBy's groups partition
  // the input — every element appears in exactly one group (its own key's),
  // and concatenating the groups (in Map iteration order) reconstructs a
  // permutation of the input containing every element exactly once.
  it('partitions the array: every element in exactly one group, none lost', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5 })), (values) => {
        const groups = groupBy(values, (n) => n % 3);
        const flattened = [...groups.values()].flat();
        expect(flattened).toHaveLength(values.length);
        // Every original element is grouped under its own key.
        values.forEach((value) => {
          expect(groups.get(value % 3)).toContain(value);
        });
        // Grouping is stable: within each key, relative input order is kept.
        for (const key of groups.keys()) {
          const expected = values.filter((v) => v % 3 === key);
          expect(groups.get(key)).toEqual(expected);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('uniq — dedup laws (spec §2 item 13)', () => {
  // Invariant: uniq is idempotent (applying it twice equals applying it once)
  // and its result is always a subset of the input with no duplicate keys.
  it('is idempotent and produces a duplicate-free subset', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -3, max: 3 })), (values) => {
        const once = uniq(values);
        const twice = uniq(once);
        expect(twice).toEqual(once);
        // Duplicate-free.
        expect(new Set(once).size).toBe(once.length);
        // Keeps exactly the first occurrence of each distinct value, in order.
        expect(once).toEqual(values.filter((v, i) => values.indexOf(v) === i));
      }),
      { numRuns: 100 },
    );
  });
});

describe('isObject / isEmpty — type-guard laws (spec §2 item 14)', () => {
  // Invariant: for any plain object built from an arbitrary key/value
  // dictionary, isObject is true and isEmpty agrees with "has no own keys".
  it('isObject is true and isEmpty matches key-count for any plain object', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (obj) => {
        expect(isObject(obj)).toBe(true);
        expect(isEmpty(obj)).toBe(Object.keys(obj).length === 0);
      }),
      { numRuns: 100 },
    );
  });

  // Invariant: for any array, isObject is always false (arrays are excluded)
  // and isEmpty matches the array's length being zero.
  it('isObject is false and isEmpty matches length-zero for any array', () => {
    fc.assert(
      fc.property(fc.array(fc.anything()), (arr) => {
        expect(isObject(arr)).toBe(false);
        expect(isEmpty(arr)).toBe(arr.length === 0);
      }),
      { numRuns: 100 },
    );
  });

  // Invariant: for any string, isEmpty matches the string's length being zero.
  it('isEmpty matches length-zero for any string', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        expect(isEmpty(str)).toBe(str.length === 0);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Recursively mutate arrays/objects in place to prove independence.
 * @param {unknown} node
 * @param {WeakSet<object>} [seen]
 */
function stampDeep(node, seen = new WeakSet()) {
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    node.push('__stamped__');
    node.forEach((child) => stampDeep(child, seen));
    return;
  }
  const record = /** @type {Record<string, unknown>} */ (node);
  for (const key of Object.keys(record)) stampDeep(record[key], seen);
  record.__stamped__ = true;
}
