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
