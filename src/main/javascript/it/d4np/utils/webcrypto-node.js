/**
 * egl-utils-js — Web Crypto surface, `node` condition (ADR-0008).
 *
 * One of the two `#webcrypto` conditional-import shims (NFR-07): Node >= 19
 * exposes `globalThis.crypto`, but the project's Node 18 floor (spec §1.1)
 * only ships Web Crypto as `webcrypto` on `node:crypto` — so this shim
 * prefers the global and falls back to the module export. Either way the
 * surface is always defined on Node.
 *
 * @module egl-utils-js/webcrypto-node
 */

import { webcrypto } from 'node:crypto';

/** @type {Crypto} */
export const cryptoSurface =
  globalThis.crypto ?? /** @type {Crypto} */ (/** @type {unknown} */ (webcrypto));
