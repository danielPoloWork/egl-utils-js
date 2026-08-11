---
'egl-utils-js': minor
---

**Breaking:** the `dompurify` peer range is `^3.4.13`, not `^3` (ROADMAP 17.11, ADR-0051).

3.4.13 is the first release without GHSA-55q2-fjhq-7xh7, so the range no longer admits a
version known vulnerable at the moment 1.0 freezes it. `sanitizeHtml` was never exposed by that
advisory — it pins `IN_PLACE: false` — but the range is what the package *claims*, and this
repository's own lockfile had resolved to exactly 3.4.12, the last vulnerable version.

The decision worth carrying forward is the reasoning, not the number: **a peer range is a
compatibility statement, not a security mechanism.** Raising a peer floor is breaking, so this
project will not ship a major per advisory — which means the floor's job is to exclude what is
already known bad at 1.0, and an advisory published later is yours to patch. You can, because
you own the dependency. That is what a peer dependency is for, and `SECURITY.md` now says so
where a consumer reads it.

On this project's side, the CI audit gate drops from `--audit-level high` to **`moderate`** — a
DOMPurify advisory is the one finding in this tree that can require a change to
`sanitizeHtml`'s own configuration, so a gate that cannot see it is the wrong gate. The two
dev-only advisories that threshold surfaces are fixed with pnpm overrides rather than excepted,
leaving no suppressions at all.
