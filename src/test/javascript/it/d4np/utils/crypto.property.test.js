import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { uuid } from '../../../../../main/javascript/it/d4np/utils/crypto.js';

// Property suite (roadmap 2.6 template) for uuid (spec §2 item 18).

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid — RFC 4122 shape law (real surface)', () => {
  // Invariant: every draw matches the v4 grammar — version nibble 4, variant
  // in [89ab], lowercase hex, 8-4-4-4-12 grouping.
  it('always matches the v4 grammar', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(uuid()).toMatch(UUID_V4);
      }),
      { numRuns: 200 },
    );
  });
});

describe('uuid — fallback assembly law (controlled bytes)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('#webcrypto');
    vi.resetModules();
  });

  // Invariant: for ANY 16 input bytes, the assembled UUID is exactly those
  // bytes in lowercase hex with byte 6 forced to (b & 0x0f) | 0x40 and byte 8
  // to (b & 0x3f) | 0x80 — nothing else altered, nothing reordered.
  it('preserves all entropy bytes except the forced version/variant bits', async () => {
    vi.doMock('#webcrypto', () => {
      /** @type {Uint8Array} */
      let nextBytes = new Uint8Array(16);
      return {
        cryptoSurface: {
          getRandomValues: (/** @type {Uint8Array} */ array) => {
            array.set(nextBytes);
            return array;
          },
        },
        __setNextBytes: (/** @type {Uint8Array} */ bytes) => {
          nextBytes = bytes;
        },
      };
    });
    const mod = await import('../../../../../main/javascript/it/d4np/utils/crypto.js');
    const shim = /** @type {any} */ (
      await import('../../../../../main/javascript/it/d4np/utils/webcrypto-browser.js')
    );
    // The mock replaced the module #webcrypto resolves to; grab its setter
    // through a fresh import of the same specifier crypto.js used.
    const mocked = /** @type {any} */ (await import('#webcrypto'));
    expect(shim).not.toBe(mocked); // sanity: the mock is in effect

    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 16, maxLength: 16 }), async (bytes) => {
        mocked.__setNextBytes(bytes);
        const value = mod.uuid();
        expect(value).toMatch(UUID_V4);
        const parsed = Uint8Array.from(value.replaceAll('-', '').match(/.{2}/g) ?? [], (pair) =>
          Number.parseInt(pair, 16),
        );
        const expected = Uint8Array.from(bytes);
        expected[6] = (expected[6] & 0x0f) | 0x40;
        expected[8] = (expected[8] & 0x3f) | 0x80;
        expect(parsed).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});
