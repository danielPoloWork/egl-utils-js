import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { localStorageWrapper } from '../../../../../main/javascript/it/d4np/utils/storage.js';

// Property suite (roadmap 2.6 template) for the storage wrappers (spec §2
// item 21). Runs against the in-memory fallback (no real storage in Node),
// which shares the exact get/set/JSON path with the real-storage case.

describe('storage wrapper — round-trip law', () => {
  beforeEach(() => {
    localStorageWrapper.clear();
  });

  // Invariant: any JSON-serializable value set then got is deep-equal to its
  // JSON clone (JSON.stringify -> parse), and has() reports it present.
  it('set then get recovers the JSON clone of any serializable value', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.jsonValue(), (key, value) => {
        localStorageWrapper.set(key, value);
        expect(localStorageWrapper.has(key)).toBe(true);
        expect(localStorageWrapper.get(key)).toEqual(JSON.parse(JSON.stringify(value)));
      }),
      { numRuns: 150 },
    );
  });

  // Invariant: after remove, the key is absent and get yields the default —
  // set/remove are inverse operations on presence.
  it('remove after set makes the key absent again', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.jsonValue(), (key, value) => {
        localStorageWrapper.set(key, value);
        localStorageWrapper.remove(key);
        expect(localStorageWrapper.has(key)).toBe(false);
        expect(localStorageWrapper.get(key, '__default__')).toBe('__default__');
      }),
      { numRuns: 100 },
    );
  });
});
