/**
 * egl-utils-js — the Web Crypto surface (ADR-0054, superseding ADR-0008).
 *
 * One module, one symbol: the **only door entropy enters this library
 * through**. Every CSPRNG read in the crypto group goes through
 * `cryptoSurface`, so "where does randomness come from" has exactly one
 * greppable answer, and the F18 contract — no `Math.random`, ever, not even
 * as a fallback — is enforceable by reading one file.
 *
 * It was two files behind a `#webcrypto` conditional import until roadmap
 * 17.14. That existed because Node 18 shipped Web Crypto only as `webcrypto`
 * on `node:crypto`, so the node condition needed a `node:` import that must
 * never reach a browser bundle (it breaks bundlers and defeats tree-shaking,
 * NFR-02). The 1.x floor is Node >= 22 and Safari >= 16.4 (ADR-0050), and
 * `globalThis.crypto` has been unflagged since Node 19, so both shims reduced
 * to this same line and the condition chose between two identical files.
 *
 * Kept as its own module rather than inlined into `crypto.js` for two
 * reasons that survive the collapse: the single-door property above, and the
 * test seam — the "runtime with no Web Crypto at all" branch is security
 * behaviour (it must throw), and mocking one module is how that branch stays
 * covered on every CI cell regardless of what the runtime actually provides.
 *
 * `undefined` is a legal value here: legacy or exotic runtimes without Web
 * Crypto reach `uuid`/`hashString`, which fail loudly rather than degrade.
 *
 * @module egl-utils-js/webcrypto
 */

/** @type {Crypto | undefined} */
export const cryptoSurface = globalThis.crypto;
