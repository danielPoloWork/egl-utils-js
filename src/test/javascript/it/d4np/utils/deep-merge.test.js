import { describe, it, expect } from 'vitest';
import { deepMerge } from '../../../../../main/javascript/it/d4np/utils/data.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

describe('deepMerge — merge rules (spec §2 item 10)', () => {
  it('recursively merges nested plain objects, source winning on conflict', () => {
    const target = { a: 1, nested: { x: 1, y: 2 }, keepT: true };
    const source = { a: 2, nested: { y: 20, z: 30 }, keepS: true };
    expect(deepMerge(target, source)).toEqual({
      a: 2,
      nested: { x: 1, y: 20, z: 30 },
      keepT: true,
      keepS: true,
    });
  });

  it('replaces arrays by default (source array wins)', () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [9] })).toEqual({ list: [9] });
  });

  it('concatenates arrays with arrayMerge: "concat"', () => {
    expect(deepMerge({ list: [1, 2] }, { list: [3, 4] }, { arrayMerge: 'concat' })).toEqual({
      list: [1, 2, 3, 4],
    });
  });

  it('honors a custom arrayMerge function', () => {
    const union = (/** @type {unknown[]} */ t, /** @type {unknown[]} */ s) => [
      ...new Set([...t, ...s]),
    ];
    expect(deepMerge({ tags: [1, 2] }, { tags: [2, 3] }, { arrayMerge: union })).toEqual({
      tags: [1, 2, 3],
    });
  });

  it('replaces non-plain objects wholesale rather than merging them', () => {
    const targetDate = new Date('2020-01-01T00:00:00Z');
    const sourceDate = new Date('2026-07-20T00:00:00Z');
    const result = deepMerge({ when: targetDate }, { when: sourceDate });
    expect(result.when).toBe(sourceDate); // whole replacement, not field merge

    // A plain object on target replaced by an array on source → source wins.
    expect(deepMerge({ v: { a: 1 } }, { v: [1, 2] })).toEqual({ v: [1, 2] });
    // A class instance is opaque.
    class Box {
      constructor(/** @type {number} */ n) {
        this.n = n;
      }
    }
    const box = new Box(5);
    expect(deepMerge({ b: { n: 1 } }, { b: box }).b).toBe(box);
  });

  it('takes keys present on only one side as-is', () => {
    expect(deepMerge({ onlyT: 1 }, { onlyS: 2 })).toEqual({ onlyT: 1, onlyS: 2 });
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.deepMerge).toBe(deepMerge);
  });
});

describe('deepMerge — non-mutation (spec §1, §3)', () => {
  it('mutates neither input and returns a distinct object', () => {
    const target = { a: 1, nested: { x: 1 } };
    const source = { b: 2, nested: { y: 2 } };
    const targetSnapshot = structuredClone(target);
    const sourceSnapshot = structuredClone(source);

    const result = deepMerge(target, source);

    expect(target).toEqual(targetSnapshot); // target untouched
    expect(source).toEqual(sourceSnapshot); // source untouched
    expect(result).not.toBe(target);
    expect(result).not.toBe(source);
  });

  it('creates a new object at every merged level (does not alias merged branches)', () => {
    const target = { nested: { x: 1 } };
    const source = { nested: { y: 2 } };
    const result = deepMerge(target, source);
    // The merged branch is a fresh object, not either input's branch.
    expect(result.nested).not.toBe(target.nested);
    expect(result.nested).not.toBe(source.nested);
    // Mutating the result's merged branch leaves both inputs intact.
    result.nested.x = 999;
    expect(target.nested.x).toBe(1);
  });
});

describe('deepMerge — argument validation (TypeError)', () => {
  it('rejects non-plain-object target or source', () => {
    expect(() => deepMerge(/** @type {any} */ (null), {})).toThrow(TypeError);
    expect(() => deepMerge({}, /** @type {any} */ ([1, 2]))).toThrow(TypeError);
    expect(() => deepMerge(/** @type {any} */ (new Date()), {})).toThrow(TypeError);
    expect(() => deepMerge({}, /** @type {any} */ ('str'))).toThrow(TypeError);
  });

  it('rejects an invalid arrayMerge strategy', () => {
    expect(() => deepMerge({}, {}, { arrayMerge: /** @type {any} */ ('nope') })).toThrow(TypeError);
  });

  it('accepts a null-prototype object as a plain object', () => {
    const bare = Object.assign(Object.create(null), { a: 1 });
    expect(deepMerge(bare, { b: 2 })).toEqual({ a: 1, b: 2 });
  });
});

describe('deepMerge — prototype-pollution safety', () => {
  it('does not pollute Object.prototype via a __proto__ key', () => {
    // JSON.parse produces an own "__proto__" key (unlike an object literal).
    const malicious = JSON.parse('{ "__proto__": { "polluted": true } }');
    const result = deepMerge({}, malicious);
    expect(/** @type {any} */ ({}).polluted).toBeUndefined(); // global prototype intact
    expect(Object.prototype).not.toHaveProperty('polluted');
    // The key is preserved as the result's own data property, not applied as a proto.
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
  });
});
