import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashString } from '../../../../../main/javascript/it/d4np/utils/crypto.js';

// Example tests (roadmap 5.4, spec §2 item 19, ADR-0008) for hashString.
// Correctness is anchored on FIPS 180-2 known-answer vectors — the platform
// is never trusted to judge itself except in the oracle property suite.

describe('hashString — known-answer vectors (FIPS 180-2)', () => {
  it('SHA-256 of the empty string', async () => {
    await expect(hashString('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('SHA-256 of "abc"', async () => {
    await expect(hashString('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('SHA-384 of the empty string', async () => {
    await expect(hashString('', 'SHA-384')).resolves.toBe(
      '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
    );
  });

  it('SHA-384 of "abc"', async () => {
    await expect(hashString('abc', 'SHA-384')).resolves.toBe(
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    );
  });

  it('SHA-512 of the empty string', async () => {
    await expect(hashString('', 'SHA-512')).resolves.toBe(
      'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
    );
  });

  it('SHA-512 of "abc"', async () => {
    await expect(hashString('abc', 'SHA-512')).resolves.toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );
  });
});

describe('hashString — contract', () => {
  it('defaults to SHA-256', async () => {
    await expect(hashString('abc')).resolves.toBe(await hashString('abc', 'SHA-256'));
  });

  it('accepts algorithm names case-insensitively (subtle.digest itself does)', async () => {
    await expect(hashString('abc', 'sha-512')).resolves.toBe(await hashString('abc', 'SHA-512'));
  });

  it('encodes input as UTF-8 (multi-byte characters change the digest)', async () => {
    // 'é' as UTF-8 is 0xc3 0xa9 — a different byte stream than 'e' + anything
    // single-byte; the digests must differ and both be well-formed.
    const plain = await hashString('e');
    const accented = await hashString('é');
    expect(accented).toMatch(/^[0-9a-f]{64}$/);
    expect(accented).not.toBe(plain);
  });

  it('rejects TypeError for non-string input', async () => {
    for (const bad of [42, null, undefined, ['a'], new Uint8Array([1])]) {
      await expect(hashString(/** @type {any} */ (bad))).rejects.toThrow(TypeError);
    }
  });

  it('rejects SHA-1 explicitly — broken algorithms are not forwarded', async () => {
    await expect(hashString('abc', 'SHA-1')).rejects.toThrow(TypeError);
    await expect(hashString('abc', 'SHA-1')).rejects.toThrow(/SHA-256.*SHA-384.*SHA-512/);
  });

  it('rejects TypeError for any other algorithm value', async () => {
    for (const bad of ['MD5', 'SHA-224', '', 42, null, {}]) {
      await expect(hashString('abc', /** @type {any} */ (bad))).rejects.toThrow(TypeError);
    }
  });
});

describe('hashString — surface matrix (controlled #webcrypto)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('#webcrypto');
    vi.resetModules();
  });

  /**
   * @param {unknown} surface
   * @returns {Promise<typeof hashString>}
   */
  async function hashStringWithSurface(surface) {
    vi.doMock('#webcrypto', () => ({ cryptoSurface: surface }));
    const mod = await import('../../../../../main/javascript/it/d4np/utils/crypto.js');
    return mod.hashString;
  }

  it('rejects TypeError when the surface is undefined', async () => {
    const h = await hashStringWithSurface(undefined);
    await expect(h('abc')).rejects.toThrow(TypeError);
    await expect(h('abc')).rejects.toThrow(/Web Crypto is not available/);
  });

  it('rejects TypeError when the surface has no subtle (non-secure browser context)', async () => {
    const h = await hashStringWithSurface({});
    await expect(h('abc')).rejects.toThrow(/secure contexts/);
  });

  it('passes the normalized algorithm and the UTF-8 bytes to subtle.digest', async () => {
    const digest = vi.fn(async () => Uint8Array.from([0x00, 0xff, 0x10]).buffer);
    const h = await hashStringWithSurface({ subtle: { digest } });
    await expect(h('aé', 'sha-384')).resolves.toBe('00ff10');
    expect(digest).toHaveBeenCalledTimes(1);
    const [name, bytes] = digest.mock.calls[0];
    expect(name).toBe('SHA-384');
    expect(Array.from(/** @type {Uint8Array} */ (bytes))).toEqual([0x61, 0xc3, 0xa9]);
  });

  it('validates input and algorithm before touching the surface', async () => {
    const digest = vi.fn();
    const h = await hashStringWithSurface({ subtle: { digest } });
    await expect(h(/** @type {any} */ (42))).rejects.toThrow(TypeError);
    await expect(h('abc', 'SHA-1')).rejects.toThrow(TypeError);
    expect(digest).not.toHaveBeenCalled();
  });
});
