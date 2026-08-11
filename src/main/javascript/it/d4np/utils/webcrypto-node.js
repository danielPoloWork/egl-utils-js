/**
 * egl-utils-js — Web Crypto surface, `node` condition (ADR-0008).
 *
 * One of the two `#webcrypto` conditional-import shims (NFR-07): the global
 * `crypto` landed in **Node 19**, while Node 18 shipped Web Crypto only as
 * `webcrypto` on `node:crypto` — so this shim prefers the global and falls back
 * to the module export. Either way the surface is always defined on Node.
 *
 * The 1.x floor is Node >= 22 (ADR-0050), so the fallback now covers only
 * runtimes below it. Kept deliberately — it costs one `??` and makes the package
 * work rather than crash on an unsupported runtime — while collapsing the whole
 * two-file shim, and the `dist/node` build it exists for, is roadmap 17.14.
 *
 * @module egl-utils-js/webcrypto-node
 */

import { webcrypto } from 'node:crypto';

/** @type {Crypto} */
export const cryptoSurface =
  globalThis.crypto ?? /** @type {Crypto} */ (/** @type {unknown} */ (webcrypto));
