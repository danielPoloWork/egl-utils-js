import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  localStorageWrapper,
  sessionStorageWrapper,
} from '../../../../../main/javascript/it/d4np/utils/storage.js';

/**
 * Assert `fn` throws a StorageError, identified by its stable `.code`
 * (ADR-0003) rather than `instanceof` — the stubbed-global tests re-import
 * the module, so its error classes are distinct objects from any imported
 * here, and cross-realm `instanceof` would spuriously fail.
 * @param {() => unknown} fn
 */
function expectStorageError(fn) {
  expect(fn).toThrow();
  let caught;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(/** @type {any} */ (caught).code).toBe('EGL_STORAGE');
  expect(/** @type {any} */ (caught).name).toBe('StorageError');
}

// Example tests (roadmap 6.1, spec §2 items 21–22). Under vitest/Node the
// exported singletons resolve to whatever the runtime offers: the in-memory
// fallback where Web Storage is absent, and the real thing where it is not —
// Node exposes `sessionStorage` on the newer lines of the 17.2 matrix, which is
// what the 22/24/26 cells surfaced. Either way the *contract* is identical,
// which is what these assert; the real-storage, quota, and parse-error paths use
// a stubbed global plus a fresh module import (the #webcrypto-matrix pattern),
// and the fallback is pinned explicitly by removing the global.

const STORAGE_MODULE = '../../../../../main/javascript/it/d4np/utils/storage.js';
// Mirrors the private constant in storage.js — the wrapper writes+removes
// this key to probe availability before trusting a real store.
const PROBE_KEY = '__egl_storage_probe__';

/** A Map-backed fake Storage that passes the availability probe. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (/** @type {string} */ k) => (map.has(k) ? map.get(k) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => map.set(k, String(v)),
    removeItem: (/** @type {string} */ k) => map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}

describe('storage wrapper — the exported singletons, on whatever the runtime offers', () => {
  beforeEach(() => {
    localStorageWrapper.clear();
  });

  it('works out of the box, whichever backend answered', () => {
    // Deliberately a contract claim, not a runtime one. `isPersistent()` used to
    // be asserted `false` here because Node had no Web Storage; that fact has an
    // expiry date (Node ships `sessionStorage` on the newer 17.2 matrix lines),
    // and a test that encodes it fails for the wrong reason. The persistence
    // claim is made where it can be made deterministically: with the global
    // removed, below.
    localStorageWrapper.set('probe', { ok: true });
    expect(localStorageWrapper.get('probe')).toEqual({ ok: true });
    expect(typeof localStorageWrapper.isPersistent()).toBe('boolean');
  });

  it('round-trips JSON-serializable values', () => {
    localStorageWrapper.set('n', 42);
    localStorageWrapper.set('s', 'hello');
    localStorageWrapper.set('o', { a: [1, 2], b: null });
    localStorageWrapper.set('bool', false);
    expect(localStorageWrapper.get('n')).toBe(42);
    expect(localStorageWrapper.get('s')).toBe('hello');
    expect(localStorageWrapper.get('o')).toEqual({ a: [1, 2], b: null });
    expect(localStorageWrapper.get('bool')).toBe(false);
  });

  it('returns the default (undefined) for an absent key', () => {
    expect(localStorageWrapper.get('missing')).toBeUndefined();
    expect(localStorageWrapper.get('missing', 'fallback')).toBe('fallback');
  });

  it('distinguishes a stored null from an absent key via has()', () => {
    localStorageWrapper.set('explicitNull', null);
    expect(localStorageWrapper.get('explicitNull', 'dflt')).toBeNull();
    expect(localStorageWrapper.has('explicitNull')).toBe(true);
    expect(localStorageWrapper.has('missing')).toBe(false);
  });

  it('remove() deletes a key', () => {
    localStorageWrapper.set('k', 1);
    localStorageWrapper.remove('k');
    expect(localStorageWrapper.has('k')).toBe(false);
    expect(localStorageWrapper.get('k')).toBeUndefined();
  });

  it('clear() empties every key', () => {
    localStorageWrapper.set('a', 1);
    localStorageWrapper.set('b', 2);
    localStorageWrapper.clear();
    expect(localStorageWrapper.has('a')).toBe(false);
    expect(localStorageWrapper.has('b')).toBe(false);
  });

  it('rejects non-serializable values with TypeError (undefined, function, symbol)', () => {
    expect(() => localStorageWrapper.set('u', undefined)).toThrow(TypeError);
    expect(() => localStorageWrapper.set('f', () => {})).toThrow(TypeError);
    expect(() => localStorageWrapper.set('sym', Symbol('x'))).toThrow(TypeError);
  });

  it('lets a native TypeError from JSON.stringify propagate (circular / BigInt)', () => {
    const circular = /** @type {any} */ ({});
    circular.self = circular;
    expect(() => localStorageWrapper.set('c', circular)).toThrow(TypeError);
    expect(() => localStorageWrapper.set('big', 10n)).toThrow(TypeError);
  });

  it('rejects a non-string key with TypeError', () => {
    for (const method of /** @type {const} */ (['get', 'set', 'remove', 'has'])) {
      expect(() => localStorageWrapper[method](/** @type {any} */ (42))).toThrow(TypeError);
    }
  });

  it('sessionStorageWrapper shares the same contract independently', () => {
    sessionStorageWrapper.clear();
    sessionStorageWrapper.set('k', 'session');
    expect(sessionStorageWrapper.get('k')).toBe('session');
    // Deliberately NOT asserting `isPersistent()` here. It used to assert
    // `false`, on the assumption that Node has no Web Storage — an environment
    // fact that expired: Node exposes `sessionStorage` on the newer lines of the
    // 17.2 matrix, so the probe finds a real store and answers `true`. The
    // wrapper is right either way; the test was asserting the runtime, not the
    // contract. The fallback itself is pinned below, with the global removed.
    // Independent backing store from localStorage.
    expect(localStorageWrapper.has('k')).toBe(false);
  });

  it('reports the in-memory fallback as non-persistent when there is no store', async () => {
    // The claim the assertion above used to make, made properly: no global, so
    // the write+remove probe fails and the wrapper falls back (ADR-0010).
    vi.stubGlobal('sessionStorage', undefined);
    vi.resetModules();
    const fresh = await import('../../../../../main/javascript/it/d4np/utils/storage.js');
    fresh.sessionStorageWrapper.set('k', 'v');
    expect(fresh.sessionStorageWrapper.get('k')).toBe('v');
    expect(fresh.sessionStorageWrapper.isPersistent()).toBe(false);
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});

describe('storage wrapper — real storage (stubbed global)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * @param {Record<string, unknown>} globals
   * @returns {Promise<typeof import('../../../../../main/javascript/it/d4np/utils/storage.js')>}
   */
  async function freshModule(globals) {
    vi.resetModules();
    for (const [name, value] of Object.entries(globals)) {
      vi.stubGlobal(name, value);
    }
    return import(STORAGE_MODULE);
  }

  it('resolves to and delegates to a real store when one is usable', async () => {
    const fake = fakeStorage();
    const mod = await freshModule({ localStorage: fake });
    mod.localStorageWrapper.set('k', { x: 1 });
    expect(mod.localStorageWrapper.isPersistent()).toBe(true);
    expect(mod.localStorageWrapper.get('k')).toEqual({ x: 1 });
    // The value really landed in the injected store, JSON-encoded.
    expect(fake._map.get('k')).toBe('{"x":1}');
    // The probe key was cleaned up, not left behind.
    expect(fake._map.has(PROBE_KEY)).toBe(false);
  });

  it('surfaces a quota failure on write as StorageError', async () => {
    let probed = false;
    const quota = {
      getItem: () => null,
      setItem: () => {
        if (!probed) {
          probed = true; // let the availability probe succeed
          return;
        }
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
    };
    const mod = await freshModule({ localStorage: quota });
    // Identity via .code, not cross-realm instanceof (ADR-0003): the
    // re-imported module has its own StorageError class object.
    expectStorageError(() => mod.localStorageWrapper.set('big', 'x'));
  });

  it('surfaces corrupt stored JSON on read as StorageError', async () => {
    const fake = fakeStorage();
    const mod = await freshModule({ localStorage: fake });
    fake._map.set('bad', 'not json{'); // written out-of-band by another actor
    expectStorageError(() => mod.localStorageWrapper.get('bad'));
  });

  it('falls back to memory when the store rejects the probe write (private browsing)', async () => {
    const rejectAll = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError'); // rejects even the probe
      },
      removeItem: () => {},
      clear: () => {},
    };
    const mod = await freshModule({ localStorage: rejectAll });
    expect(mod.localStorageWrapper.isPersistent()).toBe(false);
    // And it still works, via the in-memory fallback.
    mod.localStorageWrapper.set('k', 1);
    expect(mod.localStorageWrapper.get('k')).toBe(1);
  });

  it('falls back to memory when accessing the global throws (sandboxed iframe)', async () => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const mod = await import(STORAGE_MODULE);
      expect(mod.localStorageWrapper.isPersistent()).toBe(false);
      mod.localStorageWrapper.set('k', 'ok');
      expect(mod.localStorageWrapper.get('k')).toBe('ok');
    } finally {
      delete (/** @type {any} */ (globalThis).localStorage);
    }
  });
});
