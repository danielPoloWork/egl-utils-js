import { describe, it, expect, vi, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { cryptoSurface as browserSurface } from '../../../../../main/javascript/it/d4np/utils/webcrypto-browser.js';
import { cryptoSurface as nodeSurface } from '../../../../../main/javascript/it/d4np/utils/webcrypto-node.js';

// Shim tests (roadmap 5.3, ADR-0008): both #webcrypto conditions are
// importable and expose the surface their runtime contract promises. The
// node shim's ?? fallback is exercised on BOTH sides via stubbed globals so
// branch coverage does not depend on the Node version of the CI cell
// (globalThis.crypto exists on Node >= 19 only).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('webcrypto-browser shim (default condition)', () => {
  it('exposes exactly globalThis.crypto, defined or not', () => {
    expect(browserSurface).toBe(globalThis.crypto);
  });
});

describe('webcrypto-node shim (node condition)', () => {
  it('is always defined on Node and provides the two entropy methods', () => {
    expect(nodeSurface).toBeDefined();
    expect(typeof nodeSurface.getRandomValues).toBe('function');
    expect(typeof nodeSurface.randomUUID).toBe('function');
  });

  it('prefers globalThis.crypto when the global exists', async () => {
    const fake = { randomUUID: () => 'fake', getRandomValues: (/** @type {Uint8Array} */ a) => a };
    vi.stubGlobal('crypto', fake);
    vi.resetModules();
    const mod = await import('../../../../../main/javascript/it/d4np/utils/webcrypto-node.js');
    expect(mod.cryptoSurface).toBe(fake);
  });

  it('falls back to node:crypto webcrypto when the global is absent (Node 18 floor)', async () => {
    vi.stubGlobal('crypto', undefined);
    vi.resetModules();
    const mod = await import('../../../../../main/javascript/it/d4np/utils/webcrypto-node.js');
    expect(mod.cryptoSurface).toBe(webcrypto);
  });
});
