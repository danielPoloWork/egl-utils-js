# ADR-0028: The `/dom` entry fails fast, and the floor gate learns to see the DOM

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (maintainer), agent (senior project architect persona)
- **Related:** [spec 03](../specs/03_spec_dom_ui_table.md) §2 F43, NFR-14, NFR-16;
  ROADMAP 11.1; extends [ADR-0017](0017-platform-api-floor-gate.md) (the platform-API floor
  gate, whose deny-by-default promise this closes for the DOM);
  contrasts with [ADR-0010](0010-storage-in-memory-fallback-contract.md) (the storage
  wrappers' silent fallback) and [ADR-0003](0003-error-taxonomy-stable-codes.md) (stable
  codes over cross-realm `instanceof`)

## Context

This is the first entry in the library that cannot work without a browser, so it has to
answer a question the previous nine entries never faced: **what happens when the
environment is not there?**

The project already has a precedent pointing the other way. The storage wrappers detect an
unavailable store and fall back to an in-memory `Map`, silently, by design (ADR-0010) — and
that was right, because a degraded store still keeps a value for the life of the realm, so
the caller's code remains meaningful.

Two further problems arrive with the same PR:

1. **Element binding is where markup contracts break, silently.** The ordinary approach —
   one `querySelector` per element — turns a selector typo into a `null` that travels. The
   failure surfaces much later as "cannot read properties of null", in a handler, far from
   the cause. Anyone who has debugged a page that half-worked knows the cost is not the bug
   but the distance between the bug and its symptom.
2. **The floor gate's promise was broader than its implementation.** ADR-0017 introduced a
   *deny-by-default* platform-API inventory: a global used in the source but absent from
   the inventory fails CI. In practice the scanner matched two shapes — `Global.member` and
   `Global(` — and policed a list of names in which **no DOM type appeared at all**. So
   `x instanceof Element` would have passed in silence, and so would every
   `globalThis.document` read. Starting a DOM wave under a gate that is blind to the DOM
   would have been the worst possible moment to leave that alone.

## Decision

**1. `/dom` fails fast with a typed error; it never degrades and never no-ops.** Every
export requires a live document and, finding none, throws `DomContractError` (code
`EGL_DOM_CONTRACT`). The contrast with ADR-0010 is the whole argument: a degraded store
still stores, but a `setVisible` that quietly does nothing *reports success while the page
stays unchanged* — the caller cannot tell working from broken. A silent no-op would also be
indistinguishable from a hydration bug, which is precisely the class of failure that eats
afternoons.

The message names the API, the contract, and the DOM-free alternative
(`egl-utils-js/table`), because a bare `ReferenceError: document is not defined` names the
symptom while a server-side render is the situation.

**2. The document is resolved lazily, per call, through `globalThis`.** Never captured at
module scope. That keeps the entry side-effect-free — the property NFR-02 and `agadoo`
depend on — and it is what allows an SSR bundle to *import* the module and only fail if it
*calls* something. `globalThis.document` rather than a bare `document`, so the read itself
cannot throw where the global is absent.

**3. `bindElements` resolves the whole contract at once and reports what is missing.**
`{elements, missing}`: `missing` names every selector that matched nothing, in map order, so
the startup check is one assertion. `strict: true` converts it into a `DomContractError`
carrying `missing`, for the callers who would rather refuse to boot than limp. The returned
`elements` object is documented as a **snapshot, not a live view** — which is also the
honest argument for why event delegation (F44) exists.

**4. Element checks are structural, not `instanceof`.** `isElement` tests
`nodeType === 1` plus a callable `querySelector`, so a node from an iframe or a second jsdom
realm — which fails `instanceof Element` while being perfectly usable — is accepted. Same
reasoning as ADR-0003's stable `.code` values: identity across realms is not what
`instanceof` measures.

**5. The floor gate is extended to see the DOM (NFR-16), in three parts:**

- **The policed list gains the DOM surface**: `Element`, `HTMLElement`, `Node`,
  `DocumentFragment`, `Event`, `CustomEvent`, `EventTarget`, the three specific
  `HTML*Element` types this wave will touch, `MutationObserver`, `ResizeObserver`,
  `getComputedStyle`, `requestAnimationFrame`/`cancelAnimationFrame`, `NodeFilter`.
- **Two new reference shapes are recognised**: `x instanceof Element` (a DOM *type* used as
  a value — how a type dependency normally enters this codebase) and `globalThis.document`
  (the safe way to read a possibly-absent global, and therefore the form every *guarded* use
  takes). Deliberately **not** flagged: `typeof X` — a feature test is a declaration that
  absence is handled — and object or destructuring property keys, because `{ fetch: impl }`
  and `const { window } = options` name a property, not a global. An earlier draft matched
  any bare identifier and duly reported exactly those two shapes in `web.js` and
  `sanitize.js`, which are not uses at all; precision here is what keeps the gate credible.
- **A `GLOBALS` entry no longer authorizes members.** The member check previously passed if
  *either* the member or its parent global was inventoried, so declaring `document` once
  would have blanket-authorized every `document.*` reachable off it. It now consults the
  member inventory only.

The extension immediately found **eight real, undeclared dependencies** — `globalThis`
reads of `crypto`, `document`, `fetch`, `localStorage`, `location`, and `sessionStorage`
across five modules, all of them long-standing and all of them properly guarded, none of
them declared. They are now inventoried with BCD paths and `context` guards. The inventory
grew from 21 entries to 27, and none of that growth was new code.

**Verified non-vacuous**: planting `x instanceof HTMLElement` and `document.fooBarBaz` in a
source file makes the gate fail with two precise messages; removing them makes it pass.

## Alternatives Considered

- **Silent no-ops outside a browser** (the ADR-0010 shape). Rejected: storage degrades
  meaningfully, DOM manipulation does not. A no-op reports success while nothing happened,
  and it is indistinguishable from a hydration bug.
- **Let `ReferenceError: document is not defined` propagate.** Zero code, and it is what
  most libraries do. Rejected because the message names the symptom rather than the
  contract, carries no stable code to branch on, and gives an SSR consumer nothing to
  search for.
- **Resolve the document once at module load.** Marginally faster and much worse: it makes
  the module import-time environment-sensitive, breaks the side-effect-free property that
  tree-shaking rests on, and would fail an SSR *import* rather than an SSR *call*.
- **`instanceof Element` for element checks.** Shorter, and wrong across realms — the
  iframe and multi-jsdom cases are real, and the failure is a confusing false negative.
- **One `querySelector` per element, no `bindElements`.** Fewer bytes. Rejected: it is the
  status quo whose failure mode (a travelling `null`) this function exists to remove.
- **Return a live proxy re-querying on access** instead of a snapshot. Tempting, and it
  hides the very re-render problem that delegation solves properly; it would also make
  every property read a DOM query. Rejected in favour of documenting the snapshot and
  pointing at F44.
- **Leave the floor gate alone and file the gap as a roadmap item.** The tempting scope
  discipline. Rejected because the gap is *specifically* about the surface this PR starts
  using: deferring it means the wave's remaining items land unchecked, and NFR-16 exists to
  make that impossible.
- **A `typeof X` guard also requiring an inventory entry.** Considered while tuning the
  patterns. Rejected: a feature test is the declaration, so requiring a second one adds
  noise without adding truth.

## Consequences

- Every current and future `/dom` export inherits one environmental contract, one error
  class, and one code — and the pattern to copy is a single `requireDocument(api)` call.
- A server render that imports `/dom` succeeds and only fails on use, with a message naming
  `egl-utils-js/table` as the DOM-free path. NFR-14 asserts both directions on the matrix:
  the Node cell proves the throw, jsdom proves the behaviour.
- **The gate is now honest about the DOM**, and the 27-entry inventory documents platform
  dependencies that existed for months without being declared. Every later item in this wave
  must inventory the DOM members it touches — which is the intended friction.
- The `/errors` budget row moves 310 B → 340 B (measured 317 B): `DomContractError` costs
  26 B, paid by everyone importing the taxonomy. `/dom` itself measures 639 B against a 4 kB
  clause, and `isElement` shakes down to 61 B.
- One cost worth stating: the `instanceof` and `globalThis.` patterns are regex over
  comment-stripped source, not a parser. A dependency reached in a shape neither pattern
  models (say, `const D = globalThis['doc' + 'ument']`) still escapes. The gate is a floor
  for honest code, not a sandbox against deliberate evasion.
- A test-authoring trap found the hard way and worth passing on: vitest reads its
  environment pragma out of *any* comment, so a comment explaining that a file has **no**
  `@vitest-environment jsdom` pragma sets it. The Node-safety suite now pins
  `// @vitest-environment node` explicitly, which is better practice anyway — it cannot be
  changed out from under the suite by a config edit.

## References

- [spec 03 §2 F43, NFR-14, NFR-16](../specs/03_spec_dom_ui_table.md) — the contract
- [ADR-0017](0017-platform-api-floor-gate.md) — the floor gate this extends
- [ADR-0010](0010-storage-in-memory-fallback-contract.md) — the silent-fallback precedent
  this deliberately does not follow
- [ADR-0003](0003-error-taxonomy-stable-codes.md) — why identity is a stable code, not
  `instanceof`
- [MDN: `Document.querySelector`](https://developer.mozilla.org/docs/Web/API/Document/querySelector)
  — an invalid selector throws a `DOMException` whose `name` is `'SyntaxError'`, not a
  JavaScript `SyntaxError`; the JSDoc and a test both pin that distinction
