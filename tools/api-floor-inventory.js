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
  history: {
    guardReason: 'context',
    bcd: 'api.Window.history',
    guarded:
      'dom-history.js never reads the ambient global: `bindTableHistory` resolves `options.window ?? globalThis` and throws DomContractError naming the contract when the result has no history/location/addEventListener, so a server render or a detached document fails by contract rather than on an undefined read (spec 06 F93, ADR-0028/ADR-0063). The pure half of the same feature — the F92 state ↔ query-string pair — reaches no platform API but URLSearchParams, which is why it stays on the Node-safe /table entry (NFR-29)',
    why: 'A member reached off a local that holds the injected window still scans as this global, because a text scanner cannot tell `view.history` from the ambient one — and should not try, since the API being reached is the same either way (ADR-0064)',
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

  // --- the async Clipboard API (spec 06 F97/NFR-28, roadmap 19.4) ---
  //
  // Caught by the gate on the first run, which is worth recording: the read is
  // `navigator?.clipboard?.writeText`, and optional chaining was invisible to this
  // scan until 19.8 fixed it (ADR-0064). A wave earlier, this entry would have
  // been owed and nothing would have asked for it.
  //
  // Safari 13.1 for all three, so the version question is trivial and the real one
  // is context: the clipboard exists only in a **secure context**, which is why
  // `copyToClipboard` distinguishes 'insecure' from 'unsupported' rather than
  // reporting one failure for two different problems.
  'navigator.clipboard': {
    guardReason: 'context',
    bcd: 'api.Navigator.clipboard',
    guarded:
      'dom-clipboard.js reads it off `options.window ?? globalThis` through optional chaining and throws a typed ClipboardError when it is absent — reason `insecure` where isSecureContext is false, `unsupported` otherwise. Never a swallowed rejection: F97 exists because "nothing happened" and "it worked" look identical to a user (ADR-0066)',
  },
  // Declared by hand, like `EventTarget.addEventListener` and `Window.popstate`
  // before it: the scanner matches `Global.member`, and `clipboard` is not itself
  // a policed global, so `clipboard.writeText` is not a shape it can see. This
  // entry therefore serves check 2 — the BCD floor comparison — for the method
  // whose availability actually matters.
  'Clipboard.writeText': {
    guardReason: 'context',
    bcd: 'api.Clipboard.writeText',
    guarded:
      'reached only after `typeof writeText === "function"` and called through the clipboard it came from; a rejection is classified (NotAllowedError/SecurityError → `denied`) rather than passed on raw (ADR-0066)',
  },
  isSecureContext: {
    guardReason: 'context',
    bcd: 'api.isSecureContext',
    guarded:
      'read only to tell an HTTP page (fixable: serve over HTTPS) from an engine with no clipboard at all (not fixable), and only when the clipboard is already known to be missing. `undefined` means we do not know, and the honest answer is then `unsupported` rather than a guess. Declared by hand: it is read off the injected window, so the scanner cannot see it',
  },

  // --- the History API (spec 06 F93/NFR-28, roadmap 19.2) ---
  //
  // The first amendment this inventory has taken for a new capability rather than
  // for a gap in its own coverage. All four floors are ancient on the browser side
  // — Safari 5 for the History API, Safari 1 for `window.history` — so the version
  // question is trivial; what needs declaring is the *context* question, which is
  // the one BCD cannot answer: none of these exists in Node, and `/dom` is an
  // entry a server-side render legitimately loads.
  //
  // Reached off the injected `window` (`options.window ?? globalThis`). 19.2
  // believed these entries existed only for check 2, because the scanner could not
  // see a member read inside a template literal; 19.8 fixed the scanner
  // (ADR-0064), and check 3 now enforces every one of them — proved by deleting an
  // entry and watching the gate fail. `history` is POLICED in
  // ./api-floor-scan.js, so a future `history.foo` fails rather than passing
  // unseen.
  'history.pushState': {
    guardReason: 'context',
    bcd: 'api.History.pushState',
    guarded:
      'bindTableHistory proves history/location/addEventListener are all present and throws DomContractError naming the contract otherwise; the default write mode is push because Back moving through table states is the requirement (F93)',
  },
  'history.replaceState': {
    guardReason: 'context',
    bcd: 'api.History.replaceState',
    guarded:
      'same presence check; used for the bind-time normalization, because binding a table is not a navigation and must not add an entry (F93)',
  },
  'history.state': {
    guardReason: 'context',
    bcd: 'api.History.state',
    guarded:
      'same presence check. Read only to carry whatever history state the application stored through a write rather than replacing it with null — a table changing page is no reason to lose it',
  },
  'location.search': {
    guardReason: 'context',
    bcd: 'api.Location.search',
    guarded:
      'same presence check, which asserts `typeof location.search === "string"` specifically, since that is the member every read here depends on',
  },
  'location.protocol': {
    guardReason: 'context',
    bcd: 'api.Location.protocol',
    guarded:
      'storage.js reads it through `globalThis.location?.protocol` inside a try/catch, only to decide whether a cookie defaults to Secure; absent or throwing means not-https, which is the safe read for localhost development (ADR-0011). Present since M6 and scanned for the first time in 19.8: optional chaining was invisible to the old member pattern, which is the defect ADR-0064 fixes rather than a use that slipped past review.',
  },
  'location.pathname': {
    guardReason: 'context',
    bcd: 'api.Location.pathname',
    guarded: 'same presence check; used to rebuild the URL a write targets',
  },
  'location.hash': {
    guardReason: 'context',
    bcd: 'api.Location.hash',
    guarded:
      'same presence check; read so a write preserves the fragment, which is a different page concern than the table state and must survive it',
  },
  // Declared by hand, like `EventTarget.addEventListener` above and for the same
  // reason: an event name is a string, and strings are exactly what the scanner
  // must keep dropping — prose in a comment or a message must never read as a
  // platform call. So this entry exists for check 2, the BCD floor comparison,
  // rather than for the deny-by-default scan, and that remains true after the
  // 19.8 rewrite (ADR-0064). It is the one shape a source scanner cannot own.
  'Window.popstate': {
    guardReason: 'context',
    bcd: 'api.Window.popstate_event',
    guarded:
      'the listener is attached to the injected window and detached explicitly on teardown; no internal AbortController is created, which is how this binding avoids the BUG-0003 cross-realm signal trap rather than working around it (ADR-0045, ADR-0063)',
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
