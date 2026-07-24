/**
 * egl-utils-js — crypto utilities (spec §2 items 18–19, pure by contract).
 *
 * This module is a security surface: it produces identifiers whose
 * unpredictability callers may rely on. Its contract (ADR-0008) is
 * **Web Crypto only** — entropy comes from the platform's CSPRNG through the
 * `#webcrypto` conditional-import shim (one surface across Node and
 * browsers, NFR-07), and `Math.random` is never an acceptable fallback: if
 * no Web Crypto surface exists, the functions throw instead of degrading.
 *
 * @module egl-utils-js/crypto
 */

import { cryptoSurface } from '#webcrypto';

/**
 * Generate a random RFC 4122 version-4 UUID (spec §2 item 18, ADR-0008).
 *
 * Uses `crypto.randomUUID()` when the platform provides it; otherwise draws
 * 16 CSPRNG bytes from `crypto.getRandomValues()` and assembles the UUID by
 * hand (version and variant bits forced per RFC 4122 §4.4) — the fallback
 * matters in real browsers, where `randomUUID` exists only in secure
 * contexts while `getRandomValues` does not have that restriction. There is
 * deliberately no third path: without Web Crypto this throws, because a
 * `Math.random`-based identifier would be silently predictable.
 *
 * @example
 * uuid(); // '36b8f84d-df4e-4d49-b662-bcde71a8764f'
 *
 * @returns {string} A lowercase 36-character UUID v4 string.
 * @throws {TypeError} If the runtime has no Web Crypto surface (neither
 *   `randomUUID` nor `getRandomValues`).
 */
export function uuid() {
  if (cryptoSurface !== undefined && typeof cryptoSurface.randomUUID === 'function') {
    return cryptoSurface.randomUUID();
  }
  if (cryptoSurface !== undefined && typeof cryptoSurface.getRandomValues === 'function') {
    const bytes = cryptoSurface.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4 (RFC 4122 §4.4)
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    let out = '';
    for (let i = 0; i < 16; i += 1) {
      if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
      out += (bytes[i] + 0x100).toString(16).slice(1);
    }
    return out;
  }
  throw new TypeError(
    'Web Crypto is not available: uuid() requires crypto.randomUUID or ' +
      'crypto.getRandomValues (Math.random is never used)',
  );
}
