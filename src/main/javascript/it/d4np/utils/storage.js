/**
 * egl-utils-js/storage — browser-leaning storage helpers (spec §2 items
 * 21–23; **stateful** by contract). Kept off the root entry so Node-only
 * consumers never pull browser-leaning code (spec §4).
 *
 * `localStorageWrapper` and `sessionStorageWrapper` are safe interfaces over
 * the Web Storage API with a documented **in-memory fallback**: when the real
 * store is unavailable (Node, private browsing, disabled storage, sandboxed
 * iframe) operations transparently use a per-wrapper `Map` instead of
 * throwing. Values are JSON-(de)serialized; a genuine quota failure surfaces
 * as {@link StorageError}. `cookieHelper` lands with roadmap 6.2.
 *
 * @module egl-utils-js/storage
 */

import { StorageError } from './errors.js';

const PROBE_KEY = '__egl_storage_probe__';

/**
 * @typedef {object} StorageLike
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 * @property {() => void} clear
 */

/**
 * A `Map`-backed {@link StorageLike} — the fallback when no real Web Storage
 * is usable. Semantics mirror the platform: missing key → `null`, values
 * coerced to strings.
 *
 * @returns {StorageLike}
 */
function createMemoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? /** @type {string} */ (map.get(key)) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

/**
 * Resolve a usable real storage or `undefined`. Accessing the global can
 * throw (SecurityError in sandboxed iframes) and private browsing may reject
 * writes, so availability is proven with a write+remove probe rather than an
 * existence check.
 *
 * @param {() => Storage | undefined} getStorage
 * @returns {StorageLike | undefined}
 */
function probeRealStorage(getStorage) {
  try {
    const storage = getStorage();
    if (storage === undefined || storage === null) return undefined;
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return undefined;
  }
}

/**
 * @typedef {object} StorageWrapper
 * @property {(key: string, defaultValue?: unknown) => unknown} get - Parse and
 *   return the JSON value stored at `key`, or `defaultValue` (default
 *   `undefined`) when absent.
 * @property {(key: string, value: unknown) => void} set - JSON-serialize
 *   `value` and store it at `key`.
 * @property {(key: string) => void} remove - Delete `key`.
 * @property {() => void} clear - Delete every key.
 * @property {(key: string) => boolean} has - Whether `key` is present.
 * @property {() => boolean} isPersistent - Whether the wrapper resolved to a
 *   real Web Storage (`true`) or the in-memory fallback (`false`); resolves
 *   the backing store on first call.
 */

/** @param {unknown} key @returns {asserts key is string} */
function assertKey(key) {
  if (typeof key !== 'string') {
    throw new TypeError('key must be a string');
  }
}

/**
 * Build a storage wrapper over a lazily-resolved backing store (shared by
 * both exports; local vs session differ only in which global they read). The
 * store is resolved once, on first use — never at module load, so importing
 * this module has no side effects and is safe in Node (`sideEffects: false`).
 *
 * @param {() => Storage | undefined} getStorage
 * @param {string} label - Human name for error messages (`'localStorage'`).
 * @returns {StorageWrapper}
 */
function createStorageWrapper(getStorage, label) {
  /** @type {StorageLike | undefined} */
  let store;
  /** @type {boolean} */
  let persistent = false;

  /** @returns {StorageLike} */
  function backing() {
    if (store === undefined) {
      const real = probeRealStorage(getStorage);
      persistent = real !== undefined;
      store = real ?? createMemoryStorage();
    }
    return store;
  }

  return {
    get(key, defaultValue) {
      assertKey(key);
      const raw = backing().getItem(key);
      if (raw === null) return defaultValue;
      try {
        return JSON.parse(raw);
      } catch (cause) {
        throw new StorageError(
          `Failed to parse stored JSON for key ${JSON.stringify(key)} in ${label}`,
          { cause },
        );
      }
    },

    set(key, value) {
      assertKey(key);
      const raw = JSON.stringify(value);
      if (raw === undefined) {
        throw new TypeError(
          `value for key ${JSON.stringify(key)} is not JSON-serializable (undefined, a function, or a symbol)`,
        );
      }
      try {
        backing().setItem(key, raw);
      } catch (cause) {
        throw new StorageError(
          `Failed to write key ${JSON.stringify(key)} to ${label} (quota exceeded?)`,
          { cause },
        );
      }
    },

    remove(key) {
      assertKey(key);
      backing().removeItem(key);
    },

    clear() {
      backing().clear();
    },

    has(key) {
      assertKey(key);
      return backing().getItem(key) !== null;
    },

    isPersistent() {
      backing(); // ensure resolution has happened
      return persistent;
    },
  };
}

/**
 * Safe wrapper over `localStorage` (spec §2 item 21). See {@link StorageWrapper}.
 */
export const localStorageWrapper = createStorageWrapper(
  () => /** @type {Storage | undefined} */ (globalThis.localStorage),
  'localStorage',
);

/**
 * Safe wrapper over `sessionStorage` (spec §2 item 22). Same contract as
 * {@link localStorageWrapper} over `sessionStorage`.
 */
export const sessionStorageWrapper = createStorageWrapper(
  () => /** @type {Storage | undefined} */ (globalThis.sessionStorage),
  'sessionStorage',
);
