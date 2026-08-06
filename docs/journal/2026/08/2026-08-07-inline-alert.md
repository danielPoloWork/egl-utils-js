# 2026-08-07 — The component contract, set by inlineAlert (roadmap 12.1)

## What got done

- `inlineAlert` on `egl-utils-js/dom` (spec 03 F49) in a new `dom-components.js`: a factory
  returning `{ show, hide, destroy }` where every instance owns its nodes, its auto-hide
  timer, its close-button listener and its own `AbortController`.
- [ADR-0031](../../../adr/0031-component-instances-and-the-alert-budget.md) fixes the
  component template that 12.2 and the whole spec-04 toolkit will copy: factories over
  singletons, injected policy over hardcoded framework classes, `textContent` by default
  with the F47 `{ html, sanitize }` pair for markup, total teardown, and a loud
  use-after-destroy.
- Patterns catalogue: **Dependency Injection (component policy)** implemented, and
  **Singleton (UI component)** rejected with the concrete defect it causes.
- Threat model gained an **Alert messages** boundary plus its Tampering row — the two
  HTML-capable surfaces on `/dom` are now governed by one rule instead of two.
- `isAbortSignal` was duplicated in `dom-events.js` and `dom-fragment.js`; rather than add a
  third copy it moved to `dom-helpers.js` as an entry-internal export, and both callers now
  import it.
- ESLint's ignore list now excludes top-level dot-directories by shape rather than by name,
  so local tooling directories cannot turn `pnpm lint` red for reasons unrelated to the
  library.

## Decisions taken

- **The 1.25 kB indicative ceiling for F49 was raised to 1.5 kB, pinned at 1.48 kB on a
  measured 1382 B**, and spec 03 NFR-12 was amended in the same PR (ADR-0031). The guess
  predated the contract: it did not account for the sanitize decision and its message, the
  `ownerDocument` path, the `AbortSignal` teardown NFR-15 requires, or the `role` mapping.
  A trimming pass was done first and recovered 29 B; going further meant deleting
  capabilities the spec asks for. The entry-level promise that governs consumers — `/dom`
  ≤ 4 kB — is untouched at 2958 B.
- **F49's option list gained `closeLabel` and `signal`** in the spec: NFR-15 already named
  F49 among the exports whose teardown must ride an aborted signal, so the option list was
  the half that was incomplete.
- `show()` after `destroy()` **throws**; `hide()` after `destroy()` stays harmless.
  Idempotent teardown must not punish a defensive caller, but a silent no-op on a write
  would report success while the page stayed unchanged.
- Nodes are built on **first show**, not at construction, so an unused instance leaves the
  container untouched.

## Where the project stands

Milestones 1–11 complete, v0.4.0 tagged. M12 is half done: 12.1 lands here, 12.2
(`loadingOverlay`) is next and inherits this template. Specs 01–02 remain complete;
spec 03 is at F42–F51 with F49 done, F50 and the pipeline (M13) outstanding.

Local verification: lint + `tsc` clean, **1153 tests green with 100% lines and branches on
every `/dom` file**, `docs:api` warning-free, api-floor green at 29 inventoried APIs with no
new platform global, `check:package` green (publint, attw, size-limit, agadoo, zero runtime
deps), consistency lint green.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Start roadmap **12.2** on `feat/loading-overlay`: reference-counted `show()` returning an
   idempotent release, a minimum-visible clock started when `onShow` **settles**, and focus
   save/blur/restore over injected hooks. It copies the ADR-0031 template, so it should not
   need a component-contract ADR of its own — only one for the refcount/anti-flicker
   semantics. Its indicative 1.25 kB row gets pinned to its own measurement.
3. Carried forward, unchanged: GitHub Actions has been dead for this repo since 2026-08-06,
   so M11 and now 12.1 have landed on local verification only — the Node 18/20/22 matrix and
   the Playwright job remain unrun. Spec 03 §6 does not schedule a browser scenario for F49,
   but the M11 browser-test debt is still open and worth closing when Actions recovers.
