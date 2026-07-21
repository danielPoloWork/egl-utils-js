import { describe, it, expect } from 'vitest';
import { deepClone } from '../../../../../main/javascript/it/d4np/utils/data.js';
import { CloneError } from '../../../../../main/javascript/it/d4np/utils/errors.js';
import * as rootEntry from '../../../../../main/javascript/it/d4np/utils/index.js';

describe('deepClone — cloneable inputs (spec §2 item 9, ADR-002)', () => {
  it('returns a structurally-equal, reference-independent copy', () => {
    const original = { a: 1, nested: { b: [2, 3], c: 'x' } };
    const clone = deepClone(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.nested).not.toBe(original.nested);
    expect(clone.nested.b).not.toBe(original.nested.b);
  });

  it('does not mutate the input, and the clone is independent', () => {
    const original = { list: [1, 2], meta: { seen: false } };
    const clone = deepClone(original);
    clone.list.push(3);
    clone.meta.seen = true;
    expect(original.list).toEqual([1, 2]);
    expect(original.meta.seen).toBe(false);
  });

  it('clones dates, regexes, Map, Set, and typed arrays natively', () => {
    const date = new Date('2026-07-20T00:00:00Z');
    const map = new Map([['k', { v: 1 }]]);
    const set = new Set([1, 2, 3]);
    const bytes = new Uint8Array([1, 2, 3]);

    expect(deepClone(date)).toEqual(date);
    expect(deepClone(date)).not.toBe(date);
    expect(deepClone(/ab+c/gi)).toEqual(/ab+c/gi);

    const clonedMap = deepClone(map);
    expect(clonedMap).toEqual(map);
    expect(clonedMap.get('k')).not.toBe(map.get('k'));

    expect(deepClone(set)).toEqual(set);
    expect(deepClone(bytes)).toEqual(bytes);
  });

  it('handles circular references', () => {
    /** @type {any} */
    const cyclic = { name: 'root' };
    cyclic.self = cyclic;
    const clone = deepClone(cyclic);
    expect(clone.name).toBe('root');
    expect(clone.self).toBe(clone); // cycle preserved, pointing at the clone
    expect(clone).not.toBe(cyclic);
  });

  it('clones primitives and null as-is', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('str')).toBe('str');
    expect(deepClone(null)).toBe(null);
    expect(deepClone(undefined)).toBe(undefined);
  });

  it('is exported from the root entry', () => {
    expect(rootEntry.deepClone).toBe(deepClone);
  });
});

describe('deepClone — CloneError diagnostics (ADR-002)', () => {
  it('throws CloneError naming a nested function by path', () => {
    const input = { config: { handlers: [null, 42, function named() {}] } };
    const error = /** @type {CloneError} */ (getThrown(() => deepClone(input)));
    expect(error).toBeInstanceOf(CloneError);
    expect(error.code).toBe('EGL_CLONE');
    expect(error.path).toBe('config.handlers[2]');
    expect(error.valueType).toBe('function');
    expect(error.message).toContain('config.handlers[2]');
    expect(error.message).toContain('function');
  });

  it('names the root value when it is itself uncloneable', () => {
    const error = /** @type {CloneError} */ (getThrown(() => deepClone(() => 1)));
    expect(error).toBeInstanceOf(CloneError);
    expect(error.path).toBe('(root)');
    expect(error.valueType).toBe('function');
  });

  it('localizes a symbol value', () => {
    const error = /** @type {CloneError} */ (getThrown(() => deepClone({ id: Symbol('x') })));
    expect(error.path).toBe('id');
    expect(error.valueType).toBe('symbol');
  });

  it('localizes a Promise value', () => {
    const p = Promise.resolve(1);
    const error = /** @type {CloneError} */ (getThrown(() => deepClone({ pending: p })));
    expect(error.path).toBe('pending');
    expect(error.valueType).toBe('Promise');
    void p.catch(() => {});
  });

  it('localizes an uncloneable value inside a Map value, a Map key, and a Set', () => {
    const inMapValue = /** @type {CloneError} */ (
      getThrown(() => deepClone(new Map([['fn', () => 1]])))
    );
    expect(inMapValue.path).toBe('[Map value 0]');
    expect(inMapValue.valueType).toBe('function');

    const inMapKey = /** @type {CloneError} */ (
      getThrown(() => deepClone(new Map([[() => 1, 'v']])))
    );
    expect(inMapKey.path).toBe('[Map key 0]');
    expect(inMapKey.valueType).toBe('function');

    const inSet = /** @type {CloneError} */ (getThrown(() => deepClone(new Set([Symbol('s')]))));
    expect(inSet.path).toBe('[Set item 0]');
    expect(inSet.valueType).toBe('symbol');
  });

  it('localizes WeakMap, WeakSet, and WeakRef values', () => {
    const weakMap = /** @type {CloneError} */ (getThrown(() => deepClone({ w: new WeakMap() })));
    expect(weakMap.valueType).toBe('WeakMap');
    const weakSet = /** @type {CloneError} */ (getThrown(() => deepClone({ w: new WeakSet() })));
    expect(weakSet.valueType).toBe('WeakSet');
    const weakRef = /** @type {CloneError} */ (getThrown(() => deepClone({ w: new WeakRef({}) })));
    expect(weakRef.valueType).toBe('WeakRef');
  });

  it('handles a cyclic input that also contains an uncloneable value', () => {
    /** @type {any} */
    const cyclic = {};
    cyclic.self = cyclic; // traversed first: the walk must skip the cycle, not loop
    cyclic.bad = () => 1;
    const error = /** @type {CloneError} */ (getThrown(() => deepClone(cyclic)));
    expect(error).toBeInstanceOf(CloneError);
    expect(error.path).toBe('bad');
  });

  it('skips opaque cloneable built-ins (Date) while walking to the offender', () => {
    const input = { when: new Date(), pattern: /x/, bad: () => 1 };
    const error = /** @type {CloneError} */ (getThrown(() => deepClone(input)));
    expect(error.path).toBe('bad');
  });

  it('preserves the native DataCloneError as the cause', () => {
    const error = /** @type {CloneError} */ (getThrown(() => deepClone({ fn: () => 1 })));
    expect(error.cause).toBeInstanceOf(Error);
    expect(/** @type {Error} */ (error.cause).name).toBe('DataCloneError');
  });

  it('walks past fully-cloneable containers to the offending value', () => {
    // Every container ahead of `bad` is cloneable, so the walk traverses each
    // to the end before reaching the function.
    const input = {
      arr: [1, 2],
      map: new Map([['k', 'v']]),
      set: new Set([1, 2]),
      obj: { x: 1 },
      bad: () => 1,
    };
    const error = /** @type {CloneError} */ (getThrown(() => deepClone(input)));
    expect(error).toBeInstanceOf(CloneError);
    expect(error.path).toBe('bad');
    expect(error.valueType).toBe('function');
  });

  it('rethrows a non-DataCloneError unchanged (e.g. a throwing getter)', () => {
    const boom = new RangeError('getter blew up');
    const input = {
      get x() {
        throw boom;
      },
    };
    expect(getThrown(() => deepClone(input))).toBe(boom);
  });

  it('rethrows the native DataCloneError when the walk cannot localize the offender', () => {
    // A getter that yields an uncloneable value only on its first read: the
    // clone fails, but the diagnostic walk (a second read) sees a clean value
    // and finds nothing — so the native error is rethrown, not a fabricated path.
    let reads = 0;
    const input = {
      get x() {
        reads += 1;
        return reads === 1 ? () => 1 : 42;
      },
    };
    const error = /** @type {Error} */ (getThrown(() => deepClone(input)));
    expect(error).not.toBeInstanceOf(CloneError);
    expect(error.name).toBe('DataCloneError');
  });
});

/**
 * Run `fn`, returning whatever it throws (fails the test if it does not throw).
 * @param {() => unknown} fn
 * @returns {unknown}
 */
function getThrown(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the function to throw, but it did not');
}
