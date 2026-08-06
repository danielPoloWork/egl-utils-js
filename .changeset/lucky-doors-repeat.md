---
'egl-utils-js': minor
---

`pageSessionId` joins `egl-utils-js/storage` (ROADMAP 9.5, spec 02 F39, ADR-0024): a v4
UUID minted once and held under `sessionStorage` semantics, so it survives reloads and
in-tab navigation, dies with the tab, and differs between tabs — the scope needed to
correlate log lines, telemetry, and requests within one browsing session.

It is a **correlation id, not a credential**: unguessable because it comes from the
platform CSPRNG, but unauthenticated and readable by any script on the page. Where storage
is unavailable or blocked (Node, private browsing, a sandboxed iframe) the in-memory
fallback takes over and the id is stable only for the life of the realm; a corrupt stored
value or a refused write is absorbed rather than thrown, because a diagnostics helper must
never be the reason a page breaks.

Note for `/storage` consumers: the full-entry import grows from 1706 B to 2027 B, since
`pageSessionId` reuses `uuid` rather than reimplementing entropy handling. Importing only
the three original wrappers now costs 1698 B — slightly *less* than before — so the cost
falls only on consumers of the new function. The spec 01 NFR-01 `/storage` clause is
amended from 2 kB to 2.1 kB accordingly, with both scenarios pinned as size-limit rows.
