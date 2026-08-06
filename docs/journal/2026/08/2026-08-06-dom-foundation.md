# 2026-08-06 — The /dom foundation, and the floor gate learns to see the DOM (roadmap 11.1)

## What got done

- **`egl-utils-js/dom`** opened (spec 03 F43): `bindElements`, `isElement`,
  `requireDocument`, plus `DomContractError` (`EGL_DOM_CONTRACT`) on the errors entry. Entry
  wiring: `package.json` exports, `tsup.config.js` entry, `typedoc.json` entryPoints, four
  `.size-limit.json` rows.
- **The platform-API floor gate now covers the DOM** (spec 03 NFR-16) — the deliverable that
  made this item worth its route.
- 39 tests across two suites (jsdom for behaviour, plain Node for the fail-fast half) at
  **100% statements, branches, functions and lines**; 987 tests green overall.
- [ADR-0028](../../../adr/0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md)
  records both decisions and the eight alternatives weighed.

## Decisions taken

- **Fail fast, do not degrade.** With no DOM, every `/dom` export throws
  `DomContractError` naming the API, the contract and `egl-utils-js/table` as the DOM-free
  path. The storage wrappers' silent fallback (ADR-0010) was right because a degraded store
  still keeps a value; a `setVisible` that quietly does nothing **reports success while the
  page stays unchanged**, and is indistinguishable from a hydration bug.
- **The document is resolved lazily, per call, via `globalThis`** — never at module scope.
  That keeps the entry side-effect-free for tree-shaking *and* is what lets an SSR bundle
  import the module and fail only on use.
- **`bindElements` returns `{elements, missing}`.** The `missing` array is the whole point:
  binding one element at a time turns a typo into a travelling `null` that resurfaces far
  from its cause.
- **Element checks are structural, not `instanceof`** — a node from an iframe or a second
  jsdom realm fails `instanceof Element` while being perfectly usable. Same reasoning as
  ADR-0003's stable `.code` values.
- The returned `elements` object is documented as a **snapshot, not a live view**, which is
  also the honest argument for why delegation (11.2) exists.

## The floor gate extension, and what it found

ADR-0017 promised *deny-by-default* platform-API coverage. In practice the scanner matched
`Global.member` and `Global(`, over a policed list containing **no DOM type at all** — so
`x instanceof Element` would have passed in silence, and so would every
`globalThis.document` read. Starting a DOM wave under that gate would have left it weakest
exactly where it is needed most.

Three changes: the policed list gains the DOM surface; two precise reference shapes are
recognised (`instanceof <Global>` and `globalThis.<Global>`); and **a `GLOBALS` entry no
longer authorizes members** — the member check consulted `KNOWN_GLOBALS` too, so declaring
`document` once would have blanket-authorized every `document.*` reached off it.

It immediately found **eight real, undeclared dependencies** — `globalThis` reads of
`crypto`, `document`, `fetch`, `localStorage`, `location` and `sessionStorage` across five
modules. All long-standing, all properly guarded, none declared. Inventory: 21 → 27 entries,
with no new code.

**Precision mattered more than reach.** A first draft matched any bare identifier and
reported `{ fetch: impl }` in `web.js` and `const { window } = options` in `sanitize.js` —
property keys, not global references. `typeof X` is deliberately not flagged either: a
feature test *is* the declaration that absence is handled. A gate that cries wolf gets
switched off.

**Verified non-vacuous**: planting `x instanceof HTMLElement` and `document.fooBarBaz` makes
the gate fail with two precise messages; removing them makes it pass.

## Measurements

| Import | Measured | Row |
|---|---|---|
| `/dom` full entry | 639 B | 0.7 kB (clause 4 kB) |
| `{ bindElements }` | 616 B | 1 kB ✅ |
| `{ requireDocument }` | 252 B | 1 kB ✅ |
| `{ isElement }` | 61 B | 1 kB ✅ |
| `/errors` | 317 B | 340 B (was 310 B — `DomContractError` costs 26 B) |

## Lessons

- **A comment explaining the absence of a vitest environment pragma *is* a pragma.** The
  Node-safety suite opened by saying it deliberately had no `@vitest-environment jsdom`
  line — and vitest, which reads the pragma out of any comment, duly ran it in jsdom, so
  four assertions about a missing `document` failed against a present one. It now pins
  `// @vitest-environment node` explicitly, which is better practice regardless: the suite
  cannot be turned into a second jsdom run by a config edit.
- **An invalid CSS selector throws a `DOMException` whose `.name` is `'SyntaxError'`** — not
  a JavaScript `SyntaxError`. The JSDoc and a test both pin the distinction, and it is one
  more instance of the house rule that identity is a name or a code, never `instanceof`.
- When a gate's promise is broader than its implementation, the honest move is to close the
  gap in the wave that first depends on it — and to expect the closure to surface debt that
  predates it.

## Where the project stands

Specs 01–02 complete (v0.3.0 tagged, Release draft awaiting publication; **nothing published
to npm yet**). Spec 03 in progress: 11.1 done, **11.2 and 11.3 next**, then M12 and M13.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Roadmap **11.2** on `feat/dom-events-setters`: `delegate` with `AbortController` teardown
   (NFR-15) and the `setEnabled`/`setVisible`/`setValue` setters. Both will need DOM members
   inventoried in `tools/api-floor-inventory.js` — the friction the 11.1 gate extension
   deliberately introduced. Next free ADR number: **0029**.
3. Still open: two dependabot PRs (#64 `globals`, #65 `@playwright/test`).
