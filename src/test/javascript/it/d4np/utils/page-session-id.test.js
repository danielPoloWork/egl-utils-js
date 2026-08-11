import { describe, it, expect } from 'vitest';
import {
  pageSessionId,
  sessionStorageWrapper,
} from '../../../../../main/javascript/it/d4np/utils/storage.js';

// Example tests (roadmap 9.5, spec 02 §2 item F39, ADR-0024) for pageSessionId.
//
// Node sees the in-memory fallback throughout — the real per-tab behaviour
// (survives a reload, differs between tabs) can only be proven in a browser,
// and is asserted in src/test/browser/smoke.spec.js.

/**
 * A minimal in-memory {@link import('../../../../../main/javascript/it/d4np/utils/storage.js').StorageWrapper}
 * stand-in, so each test gets an isolated store.
 *
 * @param {{ failRead?: boolean, failWrite?: boolean, seed?: unknown }} [behaviour]
 */
function fakeStorage(behaviour = {}) {
  /** @type {Map<string, unknown>} */
  const map = new Map();
  if (behaviour.seed !== undefined) map.set('egl.pageSessionId', behaviour.seed);
  let writes = 0;
  return {
    writes: () => writes,
    get(/** @type {string} */ key) {
      if (behaviour.failRead) throw new Error('unreadable');
      return map.get(key);
    },
    set(/** @type {string} */ key, /** @type {unknown} */ value) {
      writes += 1;
      if (behaviour.failWrite) throw new Error('quota');
      map.set(key, value);
    },
  };
}

describe('pageSessionId — identity', () => {
  it('returns a v4 UUID', () => {
    const id = pageSessionId({ storage: fakeStorage() });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('mints once and returns the same id on every later call', () => {
    const storage = fakeStorage();
    const first = pageSessionId({ storage });
    expect(pageSessionId({ storage })).toBe(first);
    expect(pageSessionId({ storage })).toBe(first);
    expect(storage.writes()).toBe(1);
  });

  it('reuses an id already present in the store', () => {
    const storage = fakeStorage({ seed: 'preexisting-id' });
    expect(pageSessionId({ storage })).toBe('preexisting-id');
    expect(storage.writes()).toBe(0);
  });

  it('gives independent stores independent ids', () => {
    expect(pageSessionId({ storage: fakeStorage() })).not.toBe(
      pageSessionId({ storage: fakeStorage() }),
    );
  });

  it('gives independent keys independent ids in the same store', () => {
    const storage = fakeStorage();
    const a = pageSessionId({ storage, key: 'app.traceId' });
    const b = pageSessionId({ storage, key: 'app.otherId' });
    expect(a).not.toBe(b);
    expect(pageSessionId({ storage, key: 'app.traceId' })).toBe(a);
  });
});

describe('pageSessionId — degradation (never throws)', () => {
  it('mints a fresh id when the stored value cannot be read', () => {
    const storage = fakeStorage({ failRead: true });
    const id = pageSessionId({ storage });
    expect(typeof id).toBe('string');
    expect(id).not.toBe('');
  });

  it('replaces a stored value that is not a non-empty string', () => {
    for (const seed of [42, '', null, { id: 'x' }, true]) {
      const storage = fakeStorage({ seed });
      const id = pageSessionId({ storage });
      expect(id).toMatch(/^[0-9a-f]{8}-/);
      expect(storage.writes()).toBe(1);
    }
  });

  it('still returns an id when the store refuses the write', () => {
    const storage = fakeStorage({ failWrite: true });
    const id = pageSessionId({ storage });
    expect(id).toMatch(/^[0-9a-f]{8}-/);
    // Stability is what is lost, not the call: the next call mints again.
    expect(pageSessionId({ storage })).not.toBe(id);
  });

  it('works against the real default wrapper, whatever backs it', () => {
    // Backend-agnostic on purpose. This used to assert `isPersistent() === false`
    // on the assumption that Node has no Web Storage; Node exposes
    // `sessionStorage` on the newer lines of the 17.2 matrix, so that assertion
    // was about the runtime rather than about `pageSessionId`. What matters is
    // the id: shaped like a UUID, and stable across calls within the page (or
    // process) — which holds on either backend.
    sessionStorageWrapper.remove('egl.pageSessionId');
    const first = pageSessionId();
    expect(first).toMatch(/^[0-9a-f]{8}-/);
    expect(pageSessionId()).toBe(first);
    sessionStorageWrapper.remove('egl.pageSessionId');
  });
});

describe('pageSessionId — rejected input (ADR-0004 split)', () => {
  it('throws TypeError on a non-string key', () => {
    expect(() => pageSessionId({ key: /** @type {any} */ (7) })).toThrow(TypeError);
  });

  it('throws TypeError when storage is not a wrapper', () => {
    expect(() => pageSessionId({ storage: /** @type {any} */ (null) })).toThrow(TypeError);
    expect(() => pageSessionId({ storage: /** @type {any} */ ({}) })).toThrow(TypeError);
    expect(() => pageSessionId({ storage: /** @type {any} */ ({ get: () => undefined }) })).toThrow(
      TypeError,
    );
  });
});
