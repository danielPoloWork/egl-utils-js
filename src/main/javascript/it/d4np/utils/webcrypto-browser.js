/**
 * egl-utils-js — Web Crypto surface, `default` condition (ADR-0008).
 *
 * One of the two `#webcrypto` conditional-import shims (NFR-07): this one is
 * selected for browsers, workers, Deno, and any other runtime that is not
 * Node — environments where `globalThis.crypto` is the platform surface and
 * `node:crypto` must never appear in the module graph (it would break
 * browser bundles and defeat tree-shaking, NFR-02).
 *
 * `undefined` is a legal value here (legacy or exotic runtimes without Web
 * Crypto): consumers such as `uuid` must fail loudly rather than fall back
 * to `Math.random` (spec F18).
 *
 * @module egl-utils-js/webcrypto-browser
 */

/** @type {Crypto | undefined} */
export const cryptoSurface = globalThis.crypto;
