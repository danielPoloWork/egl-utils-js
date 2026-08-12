/**
 * The Web platform APIs this library touches, and how each is reached
 * (roadmap 8.1, ADR-0017).
 *
 * This file is the **declared** surface; `tools/check-api-floor.mjs` verifies it
 * against MDN browser-compat-data and against the source, in both directions:
 *
 * - every entry's real floor is looked up in BCD — the numbers are **not**
 *   hand-maintained here, because a hand-typed version is exactly the kind of
 *   claim that rots;
 * - an entry whose floor is newer than the declared support matrix must be
 *   marked `guarded`, naming the fallback that covers the gap;
 * - **deny-by-default**: a platform global used in the source but absent from
 *   this file fails the check. That is what makes this a gate rather than
 *   documentation — the roadmap 7.6 review found `AbortSignal.timeout` (Safari
 *   16.0) shipped against a declared Safari 15.4 floor, and nothing could have
 *   caught it.
 *
 * SCOPE. This covers **Web platform APIs**, which is where the version risk
 * lives. ES language features are governed by `tsconfig`'s `target`/`lib` and
 * by esbuild's `target: es2022`; Safari 16.4 — the 1.x floor (ADR-0050) — supports
 * ES2022, so they are not re-checked here.
 *
 * @module tools/api-floor-inventory
 */

/**
 * @typedef {object} ApiEntry
 * @property {string} bcd - Dot path into `@mdn/browser-compat-data`, e.g.
 *   `api.AbortSignal.timeout_static`. Verified to exist; a typo fails the check.
 * @property {string} [guarded] - Names the fallback or feature detection that
 *   covers a gap. Absent means "must be available across the whole matrix
 *   unguarded".
 * @property {'version' | 'context'} [guardReason] - WHY the guard exists, and it
 *   changes how the check judges it. `version`: the BCD floor is newer than the
 *   matrix, so the checker validates the guard is still needed and warns if the
 *   floor has caught up. `context`: availability depends on something BCD cannot
 *   express as a version — a secure context, a DOM being present — so the
 *   checker accepts it without ever calling it stale. Conflating the two made an
 *   earlier draft of this gate report `crypto.subtle`'s secure-context guard as
 *   obsolete purely because Safari 15.4 met the version floor.
 * @property {string} [why] - Note for a reader; never affects the verdict.
 */

/**
 * Bare globals (`structuredClone(...)`, `fetch(...)`) and constructors.
 *
 * @type {Record<string, ApiEntry>}
 */
export const GLOBALS = {
  AbortController: { bcd: 'api.AbortController.AbortController' },
  AbortSignal: { bcd: 'api.AbortSignal' },
  AggregateError: { bcd: 'javascript.builtins.AggregateError' },
  DOMException: { bcd: 'api.DOMException.DOMException' },
  Headers: { bcd: 'api.Headers.Headers' },
  Response: { bcd: 'api.Response.Response' },
  TextEncoder: { bcd: 'api.TextEncoder.TextEncoder' },
  URL: { bcd: 'api.URL.URL' },
  URLSearchParams: { bcd: 'api.URLSearchParams.URLSearchParams' },
  structuredClone: { bcd: 'api.structuredClone' },
  clearTimeout: { bcd: 'api.clearTimeout' },
  setTimeout: { bcd: 'api.setTimeout' },

  // --- globals read through `globalThis` (spec 03 NFR-16) ---
  //
  // These eight reads existed long before this wave and were invisible to the
  // gate: it matched `Global.member` and `Global(`, so the deliberately safe
  // form — `globalThis.document`, the only way to read a possibly-absent global
  // without risking a ReferenceError — slipped through every scan. Declaring
  // them is the point of a deny-by-default inventory; a GLOBALS entry authorizes
  // reading the global and nothing more, so each member reached off it still
  // needs its own entry below.
  crypto: {
    guardReason: 'context',
    bcd: 'api.crypto',
    guarded:
      'webcrypto.js reads globalThis.crypto once, as the single surface the crypto group draws entropy through, and `undefined` is a legal value there: uuid/hashString throw naming the missing surface rather than degrading to Math.random (F18, ADR-0054). The global is within the 1.x matrix — Node 19, Safari 11 — so this is no longer a floor fallback but the exotic-runtime case; 17.14 deleted the node:crypto shim the Node 18 floor needed',
  },
  document: {
    guardReason: 'context',
    bcd: 'api.Window.document',
    guarded:
      'dom-helpers.js `requireDocument` throws DomContractError naming the contract, and storage.js probes for the cookie accessor before using it (ADR-0028, ADR-0011)',
  },
  fetch: {
    guardReason: 'context',
    bcd: 'api.fetch',
    guarded:
      'web.js takes `config.fetch` and only defaults to globalThis.fetch, so a runtime without it is served by injection (ADR-0007)',
  },
  localStorage: {
    guardReason: 'context',
    bcd: 'api.Window.localStorage',
    guarded:
      'storage.js proves availability with a write+remove probe, else an in-memory Map (ADR-0010)',
  },
  location: {
    guardReason: 'context',
    bcd: 'api.Window.location',
    guarded:
      'storage.js reads the protocol only to decide the Secure cookie attribute, behind a presence check (ADR-0011)',
  },
  sessionStorage: {
    guardReason: 'context',
    bcd: 'api.Window.sessionStorage',
    guarded: 'same write+remove probe and in-memory fallback as localStorage (ADR-0010)',
  },
  getComputedStyle: {
    guardReason: 'context',
    bcd: 'api.Window.getComputedStyle',
    guarded:
      'autoGrow reads layout only through its injectable `measure` seam, whose default is the sole caller; a non-browser or layout-free host (jsdom reports every height as 0) supplies its own (ADR-0030). Note the BCD path is api.Window.getComputedStyle — there is no api.getComputedStyle node, though the function is called bare.',
  },
};

/**
 * Members reached off a platform global (`crypto.subtle`, `performance.now`).
 * Keyed as `Global.member` so the scanner can match the call site directly.
 *
 * @type {Record<string, ApiEntry>}
 */
export const MEMBERS = {
  'AbortSignal.timeout': {
    bcd: 'api.AbortSignal.timeout_static',
    why: 'unguarded since 17.2 (ADR-0050): Safari added it in 16.0 and Node in 17.3, both below the 1.x floor, so the hand-rolled fallback the 7.6 review added is deleted rather than left as a branch no supported runtime takes',
  },
  'AbortSignal.any': {
    guardReason: 'version',
    bcd: 'api.AbortSignal.any_static',
    guarded:
      'async.js `anySignal` never calls the static — it is a full reimplementation, kept because Safari added it only in 17.4, above the 16.4 floor (ADR-0004; the Node reason lapsed with the 17.2 floor raise, the Safari one did not)',
  },
  'crypto.randomUUID': {
    guardReason: 'context',
    bcd: 'api.Crypto.randomUUID',
    guarded:
      'crypto.js falls back to getRandomValues + manual RFC 4122 assembly; browsers expose randomUUID only in secure contexts (ADR-0008)',
  },
  'crypto.getRandomValues': { bcd: 'api.Crypto.getRandomValues' },
  'crypto.subtle': {
    guardReason: 'context',
    bcd: 'api.Crypto.subtle',
    guarded:
      'crypto.js throws a TypeError naming the secure-context requirement when subtle is absent, rather than degrading (ADR-0008)',
  },
  'performance.now': { bcd: 'api.Performance.now' },
  // Passing `{signal}` to addEventListener — the API `delegate` (F44) builds its
  // entire teardown on (ADR-0029). Declared by hand because the scanner cannot
  // see the call site: it is `root.addEventListener(...)` on a parameter, not
  // `EventTarget.addEventListener`. So this entry exists for check 2, the BCD
  // floor comparison, rather than to satisfy check 3's deny-by-default scan —
  // the documented limit of a regex scanner (ADR-0028), and exactly the case
  // where a hand-written declaration earns its keep.
  //
  // Checked rather than assumed: Safari 15 and Node 15.4, both **below** the
  // matrix (15.4/18 when this was written, 16.4/22 since ADR-0050), so it needs
  // no guard. The first draft of this entry claimed Safari added it in exactly
  // 15.4 — wrong, and the kind of hand-typed version claim this file exists to
  // stop.
  'EventTarget.addEventListener': {
    bcd: 'api.EventTarget.addEventListener.options_parameter.options_signal_parameter',
    why: 'delegate() registers with an internal AbortController signal, so unsubscribe is one abort() and cannot leak a retained handler reference',
  },
  'document.cookie': {
    guardReason: 'context',
    bcd: 'api.Document.cookie',
    guarded:
      'storage.js probes for a string `cookie` property and no-ops with a one-time warning outside a browser (ADR-0011)',
  },
  'localStorage.getItem': {
    guardReason: 'context',
    bcd: 'api.Window.localStorage',
    guarded:
      'storage.js proves availability with a write+remove probe and falls back to an in-memory Map (ADR-0010)',
  },
  'sessionStorage.getItem': {
    guardReason: 'context',
    bcd: 'api.Window.sessionStorage',
    guarded: 'same in-memory fallback as localStorage (ADR-0010)',
  },
};

/**
 * The support matrix from spec §3 NFR-07, as BCD browser keys. A floor newer
 * than these values requires a `guarded` entry above.
 *
 * `chrome`/`firefox` are intentionally absent: NFR-07 asks only for the last
 * two evergreen versions there, which no API in this library approaches. Safari
 * is the binding constraint, and Node is the runtime floor.
 *
 * Raised for the 1.x line in 17.2 ([ADR-0050](../docs/adr/0050-the-1x-runtime-floor.md))
 * from `nodejs 18.0.0` / `safari 15.4`: both Node lines below 22 left maintenance
 * before this floor was set, and after 1.0 raising either costs a major.
 */
export const SUPPORT_MATRIX = {
  safari: '16.4',
  nodejs: '22.0.0',
};
