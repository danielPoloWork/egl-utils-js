/**
 * egl-utils-js — data-manipulation utilities (spec §2 items 9–13, pure).
 *
 * Every function here is pure: inputs are never mutated and there is no
 * ambient state (spec §1, §3). Failures use the EglError taxonomy (ADR-0003).
 *
 * @module egl-utils-js/data
 */

import { CloneError } from './errors.js';

/**
 * Name the type of a value that `structuredClone` cannot clone, or return
 * `undefined` if the value is cloneable in isolation (it may still be a
 * container whose children need checking). Covers the common uncloneable
 * cases; host objects like DOM nodes are environment-specific and fall
 * through to the native error (see {@link deepClone}).
 *
 * @param {unknown} value
 * @returns {string | undefined}
 */
function uncloneableType(value) {
  const type = typeof value;
  if (type === 'function') return 'function';
  if (type === 'symbol') return 'symbol';
  if (value !== null && type === 'object') {
    // WeakMap/WeakSet/WeakRef are baseline on the support matrix (Node >= 18,
    // evergreen browsers, Safari >= 15.4 — spec §1.1), so no presence guard.
    if (value instanceof Promise) return 'Promise';
    if (value instanceof WeakMap) return 'WeakMap';
    if (value instanceof WeakSet) return 'WeakSet';
    if (value instanceof WeakRef) return 'WeakRef';
  }
  return undefined;
}

/**
 * @param {unknown} value
 * @returns {boolean} true for built-ins structuredClone handles with no
 *   user-supplied child values to recurse into.
 */
function isOpaqueCloneable(value) {
  return (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

/**
 * Depth-first search for the first value `structuredClone` cannot clone,
 * returning its path and type. Cycle-safe (structuredClone itself supports
 * cycles), so a `seen` set guards revisits.
 *
 * @param {unknown} value
 * @param {string} path
 * @param {WeakSet<object>} seen
 * @returns {{ path: string, valueType: string } | undefined}
 */
function findUncloneable(value, path, seen) {
  const direct = uncloneableType(value);
  if (direct) return { path: path || '(root)', valueType: direct };

  if (value === null || typeof value !== 'object') return undefined; // cloneable primitive
  if (seen.has(value)) return undefined; // cycle — structuredClone clones it fine
  seen.add(value);

  if (isOpaqueCloneable(value)) return undefined;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findUncloneable(value[i], `${path}[${i}]`, seen);
      if (found) return found;
    }
    return undefined;
  }

  if (value instanceof Map) {
    let i = 0;
    for (const [key, val] of value) {
      const foundKey = findUncloneable(key, `${path}[Map key ${i}]`, seen);
      if (foundKey) return foundKey;
      const foundVal = findUncloneable(val, `${path}[Map value ${i}]`, seen);
      if (foundVal) return foundVal;
      i += 1;
    }
    return undefined;
  }

  if (value instanceof Set) {
    let i = 0;
    for (const item of value) {
      const found = findUncloneable(item, `${path}[Set item ${i}]`, seen);
      if (found) return found;
      i += 1;
    }
    return undefined;
  }

  // Plain object or class instance: structuredClone copies own enumerable
  // string-keyed data properties (symbol keys are dropped, prototype is lost).
  for (const key of Object.keys(value)) {
    const childPath = path ? `${path}.${key}` : key;
    const found = findUncloneable(
      /** @type {Record<string, unknown>} */ (value)[key],
      childPath,
      seen,
    );
    if (found) return found;
  }
  return undefined;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isDataCloneError(error) {
  return error instanceof Error && error.name === 'DataCloneError';
}

/**
 * Deep-clone a value using the platform's native `structuredClone`
 * ([ADR-002](../../../../../../.spec/d4np_js_adr_002_deepclone.md)).
 *
 * Correctness rides the platform: dates, regexes, `Map`/`Set`, typed arrays,
 * and circular references are all handled natively. The wrapper adds the part
 * the platform does poorly — diagnostics: where native `structuredClone`
 * throws an opaque `DataCloneError`, this pre-walks the input on failure and
 * throws a {@link CloneError} naming the offending path and type
 * (e.g. `config.handlers[2] is a function`). If the offender cannot be
 * localized (e.g. an environment-specific host object such as a DOM node),
 * the native `DataCloneError` is rethrown unchanged rather than inventing a
 * path.
 *
 * Contract (structured-clone semantics, documented not bug): only own
 * enumerable data is copied — prototypes are lost, and functions, symbols,
 * and DOM nodes cannot be cloned. Callers with class instances can use
 * `Object.assign(Object.create(proto), deepClone(data))`.
 *
 * @template T
 * @param {T} value - The value to clone.
 * @returns {T} A structured deep copy.
 * @throws {CloneError} When the input contains an unsupported value the walk
 *   can localize.
 */
export function deepClone(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    if (isDataCloneError(error)) {
      const offender = findUncloneable(value, '', new WeakSet());
      if (offender) {
        throw new CloneError(
          `${offender.path} is a ${offender.valueType}; structuredClone does not support ${offender.valueType} values`,
          { path: offender.path, valueType: offender.valueType, cause: error },
        );
      }
    }
    throw error;
  }
}

/**
 * A plain data object — one whose prototype is `Object.prototype` or `null`.
 * Arrays, `Date`, `Map`, `RegExp`, and class instances are deliberately not
 * plain: `deepMerge` treats them as opaque leaf values (replaced wholesale),
 * only recursing into plain objects.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Combine two arrays per the `arrayMerge` strategy.
 *
 * @param {unknown[]} targetArray
 * @param {unknown[]} sourceArray
 * @param {'replace' | 'concat' | ((target: unknown[], source: unknown[]) => unknown[])} strategy
 * @returns {unknown[]}
 */
function combineArrays(targetArray, sourceArray, strategy) {
  if (typeof strategy === 'function') return strategy(targetArray, sourceArray);
  if (strategy === 'concat') return [...targetArray, ...sourceArray];
  return sourceArray; // 'replace' — the source array wins
}

/**
 * Merge a single (target, source) value pair.
 *
 * @param {unknown} targetValue
 * @param {unknown} sourceValue
 * @param {'replace' | 'concat' | ((target: unknown[], source: unknown[]) => unknown[])} arrayMerge
 * @returns {unknown}
 */
function mergeValue(targetValue, sourceValue, arrayMerge) {
  if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
    return mergeObjects(targetValue, sourceValue, arrayMerge);
  }
  if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
    return combineArrays(targetValue, sourceValue, arrayMerge);
  }
  return sourceValue; // source wins for every other combination
}

/**
 * Assign an **own** data property, safe against prototype pollution: a plain
 * `result[key] = value` with `key === '__proto__'` would set the prototype
 * (deepMerge is a classic pollution sink), so that key is defined as an own
 * property instead.
 *
 * @param {Record<string, unknown>} object
 * @param {string} key
 * @param {unknown} value
 * @returns {void}
 */
function assignOwn(object, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(object, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  } else {
    object[key] = value;
  }
}

/**
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} source
 * @param {'replace' | 'concat' | ((target: unknown[], source: unknown[]) => unknown[])} arrayMerge
 * @returns {Record<string, unknown>}
 */
function mergeObjects(target, source, arrayMerge) {
  /** @type {Record<string, unknown>} */
  const result = {};
  // Copy target's own keys first (references — inputs are never written to).
  for (const key of Object.keys(target)) {
    assignOwn(result, key, target[key]);
  }
  // Overlay source: recurse where both sides hold the key, else take source's.
  for (const key of Object.keys(source)) {
    const value = Object.prototype.hasOwnProperty.call(target, key)
      ? mergeValue(target[key], source[key], arrayMerge)
      : source[key];
    assignOwn(result, key, value);
  }
  return result;
}

/**
 * Recursively merge two plain objects into a **new** object (spec §2 item 10).
 * Neither input is mutated — every merged level is a fresh object and the
 * function only ever reads the inputs.
 *
 * Merge rules: where both sides hold a plain object at a key, the two are
 * merged recursively; where both hold an array, the `arrayMerge` strategy
 * decides (default `'replace'` — the source array wins; `'concat'`, or a
 * custom `(target, source) => result` function); for every other conflict the
 * source value wins. Non-plain objects (`Date`, `Map`, class instances, …)
 * are treated as opaque leaves and replaced wholesale, never merged field by
 * field.
 *
 * Independence note: the result is a new graph at every *merged* level, but
 * values taken wholesale from one side (arrays under `'replace'`, non-plain
 * objects, keys present on only one side) are **referenced, not cloned** — so
 * the result may share nested references with the inputs. This keeps function
 * values (e.g. config handlers) intact; callers needing a fully independent
 * result can {@link deepClone} it. Inputs must be acyclic.
 *
 * @template {Record<string, unknown>} T
 * @template {Record<string, unknown>} S
 * @param {T} target - The base object.
 * @param {S} source - The object whose values win on conflict.
 * @param {{ arrayMerge?: 'replace' | 'concat' | ((target: unknown[], source: unknown[]) => unknown[]) }} [options]
 * @returns {T & S} A new merged object.
 * @throws {TypeError} If `target` or `source` is not a plain object, or
 *   `arrayMerge` is neither `'replace'`, `'concat'`, nor a function.
 */
export function deepMerge(target, source, options = {}) {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    throw new TypeError('deepMerge requires target and source to be plain objects');
  }
  const { arrayMerge = 'replace' } = options;
  if (arrayMerge !== 'replace' && arrayMerge !== 'concat' && typeof arrayMerge !== 'function') {
    throw new TypeError("arrayMerge must be 'replace', 'concat', or a function");
  }
  return /** @type {T & S} */ (mergeObjects(target, source, arrayMerge));
}

/**
 * @param {unknown} object
 * @param {unknown} keys
 * @param {string} fnName
 * @returns {void}
 */
function assertObjectAndKeys(object, keys, fnName) {
  if (object === null || typeof object !== 'object') {
    throw new TypeError(`${fnName} requires an object as its first argument`);
  }
  if (!Array.isArray(keys)) {
    throw new TypeError(`${fnName} requires an array of keys as its second argument`);
  }
}

/**
 * Return a new object with **only** the given keys copied from `obj` — those
 * present as own enumerable properties (spec §2 item 11). Keys not present on
 * `obj` are skipped rather than added as `undefined`, and inherited properties
 * are never copied. The input is not mutated.
 *
 * @example
 * pick({ id: 1, name: 'a', secret: 'x' }, ['id', 'name']); // { id: 1, name: 'a' }
 *
 * @template {object} T
 * @template {keyof T} K
 * @param {T} obj - The source object.
 * @param {readonly K[]} keys - The keys to keep.
 * @returns {Pick<T, K>} A new object with just those keys.
 * @throws {TypeError} If `obj` is not an object or `keys` is not an array.
 */
export function pick(obj, keys) {
  assertObjectAndKeys(obj, keys, 'pick');
  const source = /** @type {Record<string, unknown>} */ (obj);
  /** @type {Record<string, unknown>} */
  const result = {};
  for (const key of /** @type {readonly (string | K)[]} */ (keys)) {
    const name = /** @type {string} */ (key);
    if (Object.prototype.hasOwnProperty.call(source, name)) {
      assignOwn(result, name, source[name]);
    }
  }
  return /** @type {Pick<T, K>} */ (result);
}

/**
 * Return a new object with the given keys **removed** — every own enumerable
 * property of `obj` except those listed (spec §2 item 11). The input is not
 * mutated and inherited properties are never copied.
 *
 * @example
 * omit({ id: 1, name: 'a', secret: 'x' }, ['secret']); // { id: 1, name: 'a' }
 *
 * @template {object} T
 * @template {keyof T} K
 * @param {T} obj - The source object.
 * @param {readonly K[]} keys - The keys to drop.
 * @returns {Omit<T, K>} A new object without those keys.
 * @throws {TypeError} If `obj` is not an object or `keys` is not an array.
 */
export function omit(obj, keys) {
  assertObjectAndKeys(obj, keys, 'omit');
  const source = /** @type {Record<string, unknown>} */ (obj);
  const excluded = new Set(/** @type {readonly (string | K)[]} */ (keys));
  /** @type {Record<string, unknown>} */
  const result = {};
  for (const name of Object.keys(source)) {
    if (!excluded.has(/** @type {any} */ (name))) {
      assignOwn(result, name, source[name]);
    }
  }
  return /** @type {Omit<T, K>} */ (result);
}

/**
 * Group array elements by a key derived from each element, returning a `Map`
 * (spec §2 item 12). A `Map` — not a plain object — is deliberate: an
 * arbitrary key (`'__proto__'`, `'constructor'`, a non-string) is just a key,
 * never a prototype-pollution vector or a collision with `Object.prototype`.
 *
 * @example
 * groupBy(users, (u) => u.role); // Map { 'admin' => [...], 'guest' => [...] }
 *
 * @template T
 * @template K
 * @param {readonly T[]} array - The elements to group.
 * @param {(item: T, index: number) => K} iteratee - Derives each element's
 *   group key.
 * @returns {Map<K, T[]>} A map from key to the elements sharing it, groups
 *   and elements both in first-encountered order.
 * @throws {TypeError} If `array` is not an array or `iteratee` is not a
 *   function.
 */
export function groupBy(array, iteratee) {
  if (!Array.isArray(array)) {
    throw new TypeError('groupBy requires an array as its first argument');
  }
  if (typeof iteratee !== 'function') {
    throw new TypeError('groupBy requires a function as its second argument');
  }
  /** @type {Map<K, T[]>} */
  const groups = new Map();
  array.forEach((item, index) => {
    const key = iteratee(item, index);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  });
  return groups;
}

/**
 * Return a new array with duplicate elements removed, keeping the first
 * occurrence of each (spec §2 item 13). Uniqueness is by
 * [SameValueZero](https://tc39.es/ecma262/#sec-samevaluezero) — the same
 * algorithm `Set`/`Map` use, so `NaN` is unique with itself and `+0`/`-0` are
 * the same value — optionally applied to a key derived by `iteratee` rather
 * than the element itself.
 *
 * @example
 * uniq([1, 2, 2, NaN, NaN]); // [1, 2, NaN]
 * uniq([{ id: 1 }, { id: 1 }, { id: 2 }], (x) => x.id); // first two objects, then the third
 *
 * @template T
 * @template [K=T]
 * @param {readonly T[]} array - The elements to deduplicate.
 * @param {(item: T, index: number) => K} [iteratee] - Derives the value
 *   compared for uniqueness; defaults to the element itself.
 * @returns {T[]} A new array without duplicates.
 * @throws {TypeError} If `array` is not an array or `iteratee` is given and
 *   is not a function.
 */
export function uniq(array, iteratee) {
  if (!Array.isArray(array)) {
    throw new TypeError('uniq requires an array as its first argument');
  }
  if (iteratee !== undefined && typeof iteratee !== 'function') {
    throw new TypeError('uniq requires iteratee to be a function when given');
  }
  const defaultIteratee = /** @type {(item: T, index: number) => K} */ (
    /** @type {(item: T) => unknown} */ ((item) => item)
  );
  const identify = iteratee ?? defaultIteratee;
  /** @type {Set<K>} */
  const seen = new Set();
  /** @type {T[]} */
  const result = [];
  array.forEach((item, index) => {
    const key = identify(item, index);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  });
  return result;
}
