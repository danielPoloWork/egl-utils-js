import { describe, it, expect } from 'vitest';
import { groupBy, uniq } from '../../../../../main/javascript/it/d4np/utils/data.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

describe('groupBy (spec §2 item 12)', () => {
  it('groups elements by the derived key into a Map', () => {
    const users = [
      { name: 'a', role: 'admin' },
      { name: 'b', role: 'guest' },
      { name: 'c', role: 'admin' },
    ];
    const groups = groupBy(users, (u) => u.role);
    expect(groups).toBeInstanceOf(Map);
    expect(groups.get('admin')).toEqual([users[0], users[2]]);
    expect(groups.get('guest')).toEqual([users[1]]);
    expect(groups.size).toBe(2);
  });

  it('preserves first-encountered order for both groups and elements within a group', () => {
    // Keys in encounter order (by n % 2): 1, 1, 1, 0, 1, 1 → unique order [1, 0].
    const groups = groupBy([3, 1, 3, 2, 1, 3], (n) => n % 2);
    expect([...groups.keys()]).toEqual([1, 0]);
    expect(groups.get(1)).toEqual([3, 1, 3, 1, 3]);
    expect(groups.get(0)).toEqual([2]);
  });

  it('handles a key that would collide with Object.prototype safely (Map, not object)', () => {
    const groups = groupBy(['a', 'b'], () => '__proto__');
    expect(groups.get('__proto__')).toEqual(['a', 'b']);
    expect(/** @type {any} */ ({}).polluted).toBeUndefined();
  });

  it('passes the index to the iteratee', () => {
    /** @type {number[]} */
    const seenIndexes = [];
    groupBy(['x', 'y', 'z'], (_item, index) => {
      seenIndexes.push(index);
      return 0;
    });
    expect(seenIndexes).toEqual([0, 1, 2]);
  });

  it('returns an empty Map for an empty array', () => {
    const groups = groupBy([], () => 'k');
    expect(groups.size).toBe(0);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    groupBy(input, (n) => n % 2);
    expect(input).toEqual([1, 2, 3]);
  });

  it('throws TypeError on invalid arguments', () => {
    expect(() => groupBy(/** @type {any} */ ('nope'), (x) => x)).toThrow(TypeError);
    expect(() => groupBy([], /** @type {any} */ (42))).toThrow(TypeError);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.groupBy).toBe(groupBy);
  });
});

describe('uniq (spec §2 item 13)', () => {
  it('removes duplicates by SameValueZero, keeping the first occurrence', () => {
    expect(uniq([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it('treats NaN as unique with itself (SameValueZero, unlike ===)', () => {
    expect(uniq([NaN, 1, NaN, NaN])).toEqual([NaN, 1]);
  });

  it('treats +0 and -0 as the same value (SameValueZero, unlike Object.is)', () => {
    const result = uniq([0, -0, 0]);
    expect(result).toHaveLength(1);
    expect(Object.is(result[0], 0)).toBe(true); // the first occurrence (+0) is kept
  });

  it('deduplicates by a derived key via iteratee, keeping the first full element', () => {
    const items = [
      { id: 1, v: 'first' },
      { id: 1, v: 'second' },
      { id: 2, v: 'third' },
    ];
    expect(uniq(items, (x) => x.id)).toEqual([items[0], items[2]]);
  });

  it('passes the index to the iteratee', () => {
    /** @type {number[]} */
    const seenIndexes = [];
    uniq(['a', 'b', 'c'], (_item, index) => {
      seenIndexes.push(index);
      return index; // unique by index → nothing deduplicated
    });
    expect(seenIndexes).toEqual([0, 1, 2]);
  });

  it('returns [] for an empty array', () => {
    expect(uniq([])).toEqual([]);
  });

  it('returns a new array, never the same reference, and does not mutate the input', () => {
    const input = [1, 2, 2];
    const result = uniq(input);
    expect(result).not.toBe(input);
    expect(input).toEqual([1, 2, 2]);
  });

  it('throws TypeError on invalid arguments', () => {
    expect(() => uniq(/** @type {any} */ (42))).toThrow(TypeError);
    expect(() => uniq([1, 2], /** @type {any} */ ('nope'))).toThrow(TypeError);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.uniq).toBe(uniq);
  });
});
