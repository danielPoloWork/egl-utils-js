import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uuid } from '../../../../../main/javascript/it/d4np/utils/crypto.js';

// Example tests (roadmap 5.3, spec §2 item 18, ADR-0008) for uuid(). The
// static import above exercises the real platform surface; the surface
// matrix below re-imports crypto.js against controlled surfaces, reaching
// every branch on every CI Node version (18 has no globalThis.crypto, 19+
// does — tests must not depend on which).

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid — real platform surface', () => {
  it('produces a 36-character lowercase RFC 4122 v4 UUID', () => {
    const value = uuid();
    expect(value).toHaveLength(36);
    expect(value).toMatch(UUID_V4);
  });

  it('produces distinct values across many draws', () => {
    const draws = new Set(Array.from({ length: 1000 }, () => uuid()));
    expect(draws.size).toBe(1000);
  });
});

describe('uuid — surface matrix (controlled #webcrypto)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('#webcrypto');
    vi.resetModules();
  });

  /**
   * Re-import crypto.js against an explicit surface value.
   * @param {unknown} surface
   * @returns {Promise<() => string>}
   */
  async function uuidWithSurface(surface) {
    vi.doMock('#webcrypto', () => ({ cryptoSurface: surface }));
    const mod = await import('../../../../../main/javascript/it/d4np/utils/crypto.js');
    return mod.uuid;
  }

  it('delegates to randomUUID when the surface provides it', async () => {
    const marker = '11111111-2222-4333-8444-555555555555';
    const randomUUID = vi.fn(() => marker);
    const u = await uuidWithSurface({ randomUUID });
    expect(u()).toBe(marker);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('assembles from getRandomValues when randomUUID is missing: all-zero bytes', async () => {
    const getRandomValues = vi.fn((/** @type {Uint8Array} */ array) => {
      expect(array).toBeInstanceOf(Uint8Array);
      expect(array).toHaveLength(16);
      array.fill(0x00);
      return array;
    });
    const u = await uuidWithSurface({ getRandomValues });
    // Version nibble forced to 4, variant byte forced to 0x80.
    expect(u()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('assembles from getRandomValues: all-0xff bytes force version/variant down', async () => {
    const u = await uuidWithSurface({
      getRandomValues: (/** @type {Uint8Array} */ array) => {
        array.fill(0xff);
        return array;
      },
    });
    expect(u()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('prefers getRandomValues when randomUUID exists but is not callable', async () => {
    const u = await uuidWithSurface({
      randomUUID: 'not-a-function',
      getRandomValues: (/** @type {Uint8Array} */ array) => {
        array.fill(0x00);
        return array;
      },
    });
    expect(u()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('throws TypeError when the surface is undefined (never Math.random)', async () => {
    const u = await uuidWithSurface(undefined);
    expect(() => u()).toThrow(TypeError);
    expect(() => u()).toThrow(/Web Crypto is not available/);
  });

  it('throws TypeError when the surface has neither method', async () => {
    const u = await uuidWithSurface({});
    expect(() => u()).toThrow(TypeError);
  });
});
