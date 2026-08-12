import { describe, it, expect, vi, afterEach } from 'vitest';
import { cryptoSurface } from '../../../../../main/javascript/it/d4np/utils/webcrypto.js';

// Surface tests (roadmap 17.14, ADR-0054, superseding ADR-0008's two-shim
// arrangement): one module, one symbol, resolving `globalThis.crypto` on every
// supported runtime. The `node`/`default` conditional import and its
// `node:crypto` fallback are gone — the 1.x floor is Node >= 22 (ADR-0050) and
// the global has been unflagged since Node 19, so the fallback covered only
// runtimes below the floor.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('webcrypto surface', () => {
  it('exposes exactly globalThis.crypto', () => {
    expect(cryptoSurface).toBe(globalThis.crypto);
  });

  it('is defined on every supported runtime, and provides the two entropy methods', () => {
    // Node >= 22 and Safari >= 16.4 both expose it; nothing in the matrix does not.
    expect(cryptoSurface).toBeDefined();
    expect(typeof cryptoSurface.getRandomValues).toBe('function');
    expect(typeof cryptoSurface.randomUUID).toBe('function');
  });

  it('reads the global at import time, so a stubbed global reaches a fresh import', async () => {
    // This is the seam the crypto suites use to cover the "no Web Crypto at
    // all" branch (F18: throw, never Math.random) regardless of what the CI
    // cell's runtime actually provides.
    const fake = { randomUUID: () => 'fake', getRandomValues: (/** @type {Uint8Array} */ a) => a };
    vi.stubGlobal('crypto', fake);
    vi.resetModules();
    const mod = await import('../../../../../main/javascript/it/d4np/utils/webcrypto.js');
    expect(mod.cryptoSurface).toBe(fake);
  });

  it('is undefined on a runtime with no Web Crypto, rather than throwing at import', async () => {
    vi.stubGlobal('crypto', undefined);
    vi.resetModules();
    const mod = await import('../../../../../main/javascript/it/d4np/utils/webcrypto.js');
    expect(mod.cryptoSurface).toBeUndefined();
  });
});
