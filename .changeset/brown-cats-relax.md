---
'egl-utils-js': minor
---

`delegate`, `setEnabled`, `setVisible` and `setValue` on `egl-utils-js/dom` (ROADMAP 11.2,
spec 03 F44–F45, ADR-0029).

`delegate` attaches one listener that serves every current and future descendant matching a
selector, so a re-render needs no rebinding and there is no teardown pass to forget. The
handler receives the **matched** element, not `event.target` — the deeper node actually
clicked — and matching is bounded by the root, so `closest` cannot reach an ancestor outside
the delegated subtree. Teardown is an internal `AbortController`: unsubscribe is one
`abort()`, idempotent by construction, and a caller `signal` is bridged so it cleans up in
both directions.

The setters are no-ops on nullish, because an absent optional element is a normal state and
requiring `if (el)` at every call site is how those guards get forgotten; a wrong type still
throws. `setVisible` drives the `hidden` attribute, or a given class **instead** — never
both, so hide and show always undo each other. `setValue` covers text, textarea, checkbox,
radio and single/multiple selects, clears on nullish, and deliberately dispatches no event,
matching the assignment it replaces.

Spec 03's NFR-14 is amended in the same PR to state the contract the implementation actually
has: an export that resolves the *ambient* document throws when there is none, while an
export handed an explicit node needs no global document — which is what keeps these usable
inside a server-side DOM implementation.
