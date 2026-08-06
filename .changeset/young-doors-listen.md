---
'egl-utils-js': minor
---

New entry `egl-utils-js/dom`, opened with `bindElements`, `isElement` and `requireDocument`,
plus `DomContractError` on `egl-utils-js/errors` (ROADMAP 11.1, spec 03 F43, ADR-0028).

`bindElements` resolves a whole `{name: selector}` contract in one pass and reports what is
missing, so a selector typo becomes one startup report instead of a `null` that travels;
`{strict: true}` refuses to boot instead. The entry **fails fast rather than degrading** —
with no DOM present every export throws `DomContractError` (`EGL_DOM_CONTRACT`) naming the
API, the contract, and the DOM-free alternative, because a no-op would report success while
the page stayed unchanged. Importing the entry is safe anywhere, since the document is
resolved per call, so a server render fails on use rather than on import.

Also, invisible to consumers but not to the project: the platform-API floor gate now covers
the DOM. It had policed no DOM types at all, so `x instanceof Element` and every
`globalThis.document` read passed silently; closing that surfaced eight real, undeclared
platform dependencies that had been guarded but never inventoried.
